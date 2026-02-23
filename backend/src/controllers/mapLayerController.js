const { getConnectionWithRecovery, sql } = require('../config/database');
const { logger } = require('../config/logger');

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;
const TRANSIENT_ERROR_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);

const LAYER_DEFINITIONS = [
  { id: 'tracks', label: 'Tracks', type: 'tracks' },
  { id: 'stations', label: 'Stations', type: 'asset', aliases: ['STATION', 'DEPOT'] },
  { id: 'mileposts', label: 'Mileposts', type: 'mileposts' },
  { id: 'road-crossings', label: 'Road Crossings', type: 'asset', aliases: ['ROAD CROSSING', 'ROAD CROSSINGS', 'CROSSING'] },
  { id: 'signals', label: 'Signals', type: 'asset', aliases: ['SIGNAL', 'SIGNALS'] },
  { id: 'turnouts', label: 'Turnouts', type: 'asset', aliases: ['TURNOUT', 'TURNOUTS', 'SWITCH'] },
  { id: 'detectors', label: 'Detectors', type: 'asset', aliases: ['DETECTOR', 'DETECTORS'] },
  { id: 'derails', label: 'Derails', type: 'asset', aliases: ['DERAIL', 'DERAILS'] },
  { id: 'rail-crossings', label: 'Rail Crossings', type: 'asset', aliases: ['RAIL CROSSING', 'RAIL CROSSINGS', 'CROSSING'] },
  { id: 'snowsheds', label: 'Snowsheds', type: 'asset', aliases: ['SNOWSHED', 'SNOWSHEDS'] },
  { id: 'tunnels', label: 'Tunnels', type: 'asset', aliases: ['TUNNEL', 'TUNNELS'] },
  { id: 'bridges', label: 'Bridges', type: 'asset', aliases: ['BRIDGE', 'BRIDGES'] },
  { id: 'arches', label: 'Arches', type: 'asset', aliases: ['ARCH', 'ARCHES'] },
  { id: 'culverts', label: 'Culverts', type: 'asset', aliases: ['CULVERT', 'CULVERTS'] },
  { id: 'depots', label: 'Depots', type: 'asset', aliases: ['DEPOT', 'DEPOTS'] },
  { id: 'control-points', label: 'Control Points', type: 'asset', aliases: ['CONTROL POINT', 'CONTROL POINTS', 'CP'] },
];

const parseLayerId = (layerId) => LAYER_DEFINITIONS.find((layer) => layer.id === layerId) || null;

const getLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(parsed, MAX_LIMIT));
};

const parseSubdivisionId = (value) => {
  if (value === undefined || value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_ERROR_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
};

const queryWithRetry = async (requestFactory, query, logContext, maxRetries = 5) => {
  let lastError;
  let forceReconnect = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // Recover a fresh pool after transient socket failures.
      const pool = await getConnectionWithRecovery({ forceReconnect });
      const request = requestFactory(pool);
      forceReconnect = false;
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      forceReconnect = true;
      const delay = 200 * (2 ** (attempt - 1));
      logger.warn(`Map layer query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, {
        context: logContext,
        error: error.message,
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
};

const getMilepostSchemaFlagsWithRetry = async (logContext = 'milepostSchemaFlags') => {
  const result = await queryWithRetry(
    (pool) => pool.request(),
    `
      SELECT 
        COL_LENGTH('Milepost_Geometry', 'Is_Active') AS HasIsActive,
        COL_LENGTH('Milepost_Geometry', 'Track_Type') AS HasTrackType,
        COL_LENGTH('Milepost_Geometry', 'Track_Number') AS HasTrackNumber
    `,
    logContext
  );
  const row = result.recordset[0] || {};
  return {
    hasIsActive: row.HasIsActive !== null,
    hasTrackType: row.HasTrackType !== null,
    hasTrackNumber: row.HasTrackNumber !== null,
  };
};

class MapLayerController {
  async listLayers(req, res) {
    try {
      const agencyId = req.user.Agency_ID;
      const subdivisionId = parseSubdivisionId(req.query.subdivisionId);
      const subdivisionFilter = subdivisionId ? 'AND t.Subdivision_ID = @subdivisionId' : '';
      const milepostSubdivisionFilter = subdivisionId ? 'AND mg.Subdivision_ID = @subdivisionId' : '';

      const trackCountResult = await queryWithRetry(
        (pool) => pool.request()
          .input('agencyId', sql.Int, agencyId)
          .input('subdivisionId', sql.Int, subdivisionId),
        `
          SELECT COUNT(*) AS Count
          FROM Tracks t
          INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
          WHERE s.Agency_ID = @agencyId
            ${subdivisionFilter}
            AND (
              t.Asset_Status IS NULL OR
              LTRIM(RTRIM(t.Asset_Status)) = '' OR
              UPPER(t.Asset_Status) = 'ACTIVE'
            )
            AND t.Latitude IS NOT NULL
            AND t.Longitude IS NOT NULL
        `,
        'listLayers.trackCount'
      );

      const milepostFlags = await getMilepostSchemaFlagsWithRetry('listLayers.schemaFlags');
      const milepostActiveClause = milepostFlags.hasIsActive ? 'AND (mg.Is_Active = 1 OR mg.Is_Active IS NULL)' : '';

      const milepostCountResult = await queryWithRetry(
        (poolForRequest) => poolForRequest.request()
          .input('agencyId', sql.Int, agencyId)
          .input('subdivisionId', sql.Int, subdivisionId),
        `
          SELECT COUNT(*) AS Count
          FROM Milepost_Geometry mg
          INNER JOIN Subdivisions s ON mg.Subdivision_ID = s.Subdivision_ID
          WHERE s.Agency_ID = @agencyId
            ${milepostSubdivisionFilter}
            ${milepostActiveClause}
            AND mg.Latitude IS NOT NULL
            AND mg.Longitude IS NOT NULL
        `,
        'listLayers.milepostCount'
      );

      const trackCount = trackCountResult.recordset[0]?.Count || 0;
      const milepostCount = milepostCountResult.recordset[0]?.Count || 0;

      const layers = [];
      for (const layer of LAYER_DEFINITIONS) {
        if (layer.type === 'tracks') {
          layers.push({ ...layer, count: trackCount });
          continue;
        }
        if (layer.type === 'mileposts') {
          layers.push({ ...layer, count: milepostCount });
          continue;
        }

        const aliasParams = (layer.aliases || []).map((_, index) => `@alias${index}`);
        const aliasMatch = aliasParams.length
          ? `AND (
              ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Type,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
              OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_SubType,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
              OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Name,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
            )`
          : '';

        const countResult = await queryWithRetry(
          (pool) => {
            const request = pool.request()
              .input('agencyId', sql.Int, agencyId)
              .input('subdivisionId', sql.Int, subdivisionId);
            (layer.aliases || []).forEach((alias, index) => {
              request.input(`alias${index}`, sql.NVarChar, alias.toUpperCase());
            });
            return request;
          },
          `
          SELECT COUNT(*) AS Count
          FROM Tracks t
          INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
          WHERE s.Agency_ID = @agencyId
            ${subdivisionFilter}
            AND (
              t.Asset_Status IS NULL OR
              LTRIM(RTRIM(t.Asset_Status)) = '' OR
              UPPER(t.Asset_Status) = 'ACTIVE'
            )
            AND t.Latitude IS NOT NULL
            AND t.Longitude IS NOT NULL
            ${aliasMatch}
        `,
          `listLayers.${layer.id}`
        );

        layers.push({
          ...layer,
          count: countResult.recordset[0]?.Count || 0,
        });
      }

      res.json({
        success: true,
        data: {
          layers,
        },
      });
    } catch (error) {
      logger.error('List map layers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load map layers',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      });
    }
  }

  async searchLayers(req, res) {
    try {
      const agencyId = req.user.Agency_ID;
      const query = String(req.query.q || '').trim();
      const subdivisionId = parseSubdivisionId(req.query.subdivisionId);
      const limit = getLimit(req.query.limit || 200);
      const layerIds = String(req.query.layers || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!query) {
        return res.json({ success: true, data: { query, results: [] } });
      }

      const selectedLayers = layerIds.length
        ? LAYER_DEFINITIONS.filter((layer) => layerIds.includes(layer.id))
        : LAYER_DEFINITIONS;

      const subdivisionFilter = subdivisionId ? 'AND t.Subdivision_ID = @subdivisionId' : '';
      const milepostSubdivisionFilter = subdivisionId ? 'AND mg.Subdivision_ID = @subdivisionId' : '';
      const queryLike = `%${query}%`;

      const results = [];

      for (const layer of selectedLayers) {
        if (layer.type === 'tracks') {
          const result = await queryWithRetry(
            (pool) => pool.request()
              .input('agencyId', sql.Int, agencyId)
              .input('subdivisionId', sql.Int, subdivisionId)
              .input('limit', sql.Int, limit)
              .input('qLike', sql.NVarChar, queryLike),
            `
            SELECT TOP (@limit)
              t.Track_ID AS id,
              t.Latitude,
              t.Longitude,
              COALESCE(t.Asset_Name, t.Asset_Type, 'Track') AS title,
              CONCAT(ISNULL(s.Subdivision_Code, ''), ' ', ISNULL(t.Track_Type, ''), ' ', ISNULL(t.Track_Number, '')) AS subtitle
            FROM Tracks t
            INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agencyId
              ${subdivisionFilter}
              AND (
                t.Asset_Status IS NULL OR
                LTRIM(RTRIM(t.Asset_Status)) = '' OR
                UPPER(t.Asset_Status) = 'ACTIVE'
              )
              AND t.Latitude IS NOT NULL
              AND t.Longitude IS NOT NULL
              AND (
                t.Asset_Name LIKE @qLike OR
                t.Asset_Type LIKE @qLike OR
                t.Asset_SubType LIKE @qLike OR
                t.Track_Type LIKE @qLike OR
                t.Track_Number LIKE @qLike OR
                t.LS LIKE @qLike
              )
            ORDER BY t.Track_ID
          `,
            `searchLayers.${layer.id}`
          );

          if (result.recordset.length) {
            results.push({
              layerId: layer.id,
              label: layer.label,
              items: result.recordset,
            });
          }
          continue;
        }

        if (layer.type === 'mileposts') {
          const flags = await getMilepostSchemaFlagsWithRetry('searchLayers.mileposts.schemaFlags');
          const milepostActiveClause = flags.hasIsActive ? 'AND (mg.Is_Active = 1 OR mg.Is_Active IS NULL)' : '';

          const result = await queryWithRetry(
            (poolForRequest) => poolForRequest.request()
              .input('agencyId', sql.Int, agencyId)
              .input('subdivisionId', sql.Int, subdivisionId)
              .input('limit', sql.Int, limit)
              .input('qLike', sql.NVarChar, queryLike),
            `
            SELECT TOP (@limit)
              mg.Milepost_ID AS id,
              mg.Latitude,
              mg.Longitude,
              CONCAT('MP ', CONVERT(VARCHAR(20), mg.MP)) AS title,
              ISNULL(s.Subdivision_Code, '') AS subtitle
            FROM Milepost_Geometry mg
            INNER JOIN Subdivisions s ON mg.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agencyId
              ${milepostSubdivisionFilter}
              ${milepostActiveClause}
              AND mg.Latitude IS NOT NULL
              AND mg.Longitude IS NOT NULL
              AND (
                CONVERT(VARCHAR(20), mg.MP) LIKE @qLike OR
                ISNULL(s.Subdivision_Code, '') LIKE @qLike OR
                ISNULL(s.Subdivision_Name, '') LIKE @qLike
              )
            ORDER BY mg.MP
          `,
            `searchLayers.${layer.id}`
          );

          if (result.recordset.length) {
            results.push({
              layerId: layer.id,
              label: layer.label,
              items: result.recordset,
            });
          }
          continue;
        }

        if (layer.type === 'asset') {
          const aliasParams = (layer.aliases || []).map((_, index) => `@alias${index}`);
          const aliasMatch = aliasParams.length
            ? `AND (
                ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Type,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
                OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_SubType,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
                OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Name,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
              )`
            : '';

          const result = await queryWithRetry(
            (pool) => {
              const retryRequest = pool.request()
                .input('agencyId', sql.Int, agencyId)
                .input('subdivisionId', sql.Int, subdivisionId)
                .input('limit', sql.Int, limit)
                .input('qLike', sql.NVarChar, queryLike);
              (layer.aliases || []).forEach((alias, index) => {
                retryRequest.input(`alias${index}`, sql.NVarChar, alias.toUpperCase());
              });
              return retryRequest;
            },
            `
            SELECT TOP (@limit)
              t.Track_ID AS id,
              t.Latitude,
              t.Longitude,
              COALESCE(t.Asset_Name, t.Asset_Type, '${layer.label}') AS title,
              CONCAT(ISNULL(s.Subdivision_Code, ''), ' ', ISNULL(t.Asset_Type, '')) AS subtitle
            FROM Tracks t
            INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agencyId
              ${subdivisionFilter}
              AND (
                t.Asset_Status IS NULL OR
                LTRIM(RTRIM(t.Asset_Status)) = '' OR
                UPPER(t.Asset_Status) = 'ACTIVE'
              )
              AND t.Latitude IS NOT NULL
              AND t.Longitude IS NOT NULL
              ${aliasMatch}
              AND (
                t.Asset_Name LIKE @qLike OR
                t.Asset_Type LIKE @qLike OR
                t.Asset_SubType LIKE @qLike OR
                t.Track_Type LIKE @qLike OR
                t.Track_Number LIKE @qLike OR
                s.Subdivision_Code LIKE @qLike
              )
            ORDER BY t.Track_ID
          `,
            `searchLayers.${layer.id}`
          );

          if (result.recordset.length) {
            results.push({
              layerId: layer.id,
              label: layer.label,
              items: result.recordset,
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          query,
          results,
        },
      });
    } catch (error) {
      logger.error('Search map layers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search map layers',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      });
    }
  }

  async getLayerData(req, res) {
    try {
      const agencyId = req.user.Agency_ID;
      const layerId = req.params.layerId;
      const subdivisionId = parseSubdivisionId(req.query.subdivisionId);
      const limit = getLimit(req.query.limit);
      const minLat = req.query.minLat !== undefined ? Number.parseFloat(req.query.minLat) : null;
      const maxLat = req.query.maxLat !== undefined ? Number.parseFloat(req.query.maxLat) : null;
      const minLng = req.query.minLng !== undefined ? Number.parseFloat(req.query.minLng) : null;
      const maxLng = req.query.maxLng !== undefined ? Number.parseFloat(req.query.maxLng) : null;
      const hasBounds =
        Number.isFinite(minLat) &&
        Number.isFinite(maxLat) &&
        Number.isFinite(minLng) &&
        Number.isFinite(maxLng);

      const parsed = parseLayerId(layerId);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          error: 'Invalid layer id',
        });
      }

      const subdivisionFilter = subdivisionId ? 'AND t.Subdivision_ID = @subdivisionId' : '';
      const milepostSubdivisionFilter = subdivisionId ? 'AND mg.Subdivision_ID = @subdivisionId' : '';
      const trackBoundsFilter = hasBounds
        ? 'AND t.Latitude BETWEEN @minLat AND @maxLat AND t.Longitude BETWEEN @minLng AND @maxLng'
        : '';
      const milepostBoundsFilter = hasBounds
        ? 'AND mg.Latitude BETWEEN @minLat AND @maxLat AND mg.Longitude BETWEEN @minLng AND @maxLng'
        : '';

      if (parsed.type === 'tracks') {
        const result = await queryWithRetry(
          (pool) => pool.request()
            .input('agencyId', sql.Int, agencyId)
            .input('subdivisionId', sql.Int, subdivisionId)
            .input('limit', sql.Int, limit)
            .input('minLat', sql.Float, minLat)
            .input('maxLat', sql.Float, maxLat)
            .input('minLng', sql.Float, minLng)
            .input('maxLng', sql.Float, maxLng),
          `
            SELECT TOP (@limit)
              t.Track_ID,
              t.Subdivision_ID,
              t.Track_Type,
              t.Track_Number,
              t.Asset_Name,
              t.Asset_Type,
              t.Asset_SubType,
              t.Latitude,
              t.Longitude
            FROM Tracks t
            INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agencyId
              ${subdivisionFilter}
              AND (
                t.Asset_Status IS NULL OR
                LTRIM(RTRIM(t.Asset_Status)) = '' OR
                UPPER(t.Asset_Status) = 'ACTIVE'
              )
              AND t.Latitude IS NOT NULL
              AND t.Longitude IS NOT NULL
              ${trackBoundsFilter}
            ORDER BY t.Track_ID
          `,
          `getLayerData.${layerId}`
        );

        return res.json({
          success: true,
          data: {
            layerId,
            count: result.recordset.length,
            features: result.recordset,
          },
        });
      }

      if (parsed.type === 'mileposts') {
        const milepostFlags = await getMilepostSchemaFlagsWithRetry(`getLayerData.${layerId}.schemaFlags`);
        const milepostActiveClause = milepostFlags.hasIsActive ? 'AND (mg.Is_Active = 1 OR mg.Is_Active IS NULL)' : '';
        const trackTypeColumn = milepostFlags.hasTrackType ? 'mg.Track_Type' : 'NULL AS Track_Type';
        const trackNumberColumn = milepostFlags.hasTrackNumber ? 'mg.Track_Number' : 'NULL AS Track_Number';

        const result = await queryWithRetry(
          (poolForRequest) => poolForRequest.request()
            .input('agencyId', sql.Int, agencyId)
            .input('subdivisionId', sql.Int, subdivisionId)
            .input('limit', sql.Int, limit)
            .input('minLat', sql.Float, minLat)
            .input('maxLat', sql.Float, maxLat)
            .input('minLng', sql.Float, minLng)
            .input('maxLng', sql.Float, maxLng),
          `
            SELECT TOP (@limit)
              mg.Milepost_ID,
              mg.Subdivision_ID,
              mg.MP,
              mg.Latitude,
              mg.Longitude,
              ${trackTypeColumn},
              ${trackNumberColumn}
            FROM Milepost_Geometry mg
            INNER JOIN Subdivisions s ON mg.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agencyId
              ${milepostSubdivisionFilter}
              ${milepostActiveClause}
              AND mg.Latitude IS NOT NULL
              AND mg.Longitude IS NOT NULL
              ${milepostBoundsFilter}
            ORDER BY mg.MP
          `,
          `getLayerData.${layerId}`
        );

        return res.json({
          success: true,
          data: {
            layerId,
            count: result.recordset.length,
            features: result.recordset,
          },
        });
      }

      if (parsed.type === 'asset') {
        const aliasParams = (parsed.aliases || []).map((_, index) => `@alias${index}`);
        const aliasMatch = aliasParams.length
          ? `AND (
              ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Type,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
              OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_SubType,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
              OR ${aliasParams.map((p) => `UPPER(ISNULL(t.Asset_Name,'')) LIKE '%' + ${p} + '%'`).join(' OR ')}
            )`
          : '';

        const result = await queryWithRetry(
          (pool) => {
            const request = pool.request()
              .input('agencyId', sql.Int, agencyId)
              .input('subdivisionId', sql.Int, subdivisionId)
              .input('limit', sql.Int, limit)
              .input('minLat', sql.Float, minLat)
              .input('maxLat', sql.Float, maxLat)
              .input('minLng', sql.Float, minLng)
              .input('maxLng', sql.Float, maxLng);
            (parsed.aliases || []).forEach((alias, index) => {
              request.input(`alias${index}`, sql.NVarChar, alias.toUpperCase());
            });
            return request;
          },
          `
          SELECT TOP (@limit)
            t.Track_ID,
            t.Subdivision_ID,
            t.Track_Type,
            t.Track_Number,
            t.Asset_Name,
            t.Asset_Type,
            t.Asset_SubType,
            t.Latitude,
            t.Longitude
          FROM Tracks t
          INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
          WHERE s.Agency_ID = @agencyId
            ${subdivisionFilter}
            AND (
              t.Asset_Status IS NULL OR
              LTRIM(RTRIM(t.Asset_Status)) = '' OR
              UPPER(t.Asset_Status) = 'ACTIVE'
            )
            AND t.Latitude IS NOT NULL
            AND t.Longitude IS NOT NULL
            ${aliasMatch}
            ${trackBoundsFilter}
          ORDER BY t.Track_ID
        `,
          `getLayerData.${layerId}`
        );

        return res.json({
          success: true,
          data: {
            layerId,
            count: result.recordset.length,
            features: result.recordset,
          },
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Unsupported layer type',
      });
    } catch (error) {
      logger.error('Get map layer data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load layer data',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      });
    }
  }
}

module.exports = new MapLayerController();
