const db = require('../config/database');
const { sql } = require('../config/database');
const {
  getFieldConfigurations,
  getMilepostDecimalPlaces,
  getMilepostInterpolationConfig
} = require('../services/agencyConfigService');

const TRANSIENT_DB_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const INTERPOLATE_SCHEMA_CACHE_TTL_MS = 60 * 1000;
let interpolateSchemaCache = null;
let interpolateSchemaCacheAt = 0;

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_DB_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
};

const runQueryWithRetry = async (requestFactory, query, context, maxRetries = 5) => {
  let lastError;
  let forceReconnect = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const pool = await db.getConnectionWithRecovery({ forceReconnect });
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
      // Keep log lightweight to avoid noisy error spam.
      console.warn(`Track query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, {
        context,
        error: error.message
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }

  throw lastError;
};

const getInterpolateSchemaFlags = async (forceRefresh = false) => {
  const now = Date.now();
  if (
    !forceRefresh &&
    interpolateSchemaCache &&
    now - interpolateSchemaCacheAt < INTERPOLATE_SCHEMA_CACHE_TTL_MS
  ) {
    return interpolateSchemaCache;
  }

  const flagsResult = await runQueryWithRetry(
    (pool) => pool.request(),
    `
      SELECT
        OBJECT_ID('Track_Mileposts', 'U') AS HasTrackMileposts,
        COL_LENGTH('Milepost_Geometry', 'Is_Active') AS HasMPIsActive
    `,
    'interpolateMilepost.flags'
  );

  const flags = flagsResult.recordset[0] || {};
  interpolateSchemaCache = {
    hasTrackMileposts: flags.HasTrackMileposts !== null,
    hasMPIsActive: flags.HasMPIsActive !== null,
  };
  interpolateSchemaCacheAt = now;
  return interpolateSchemaCache;
};

const getPrecisionFromRequest = (req) => {
  const rawPrecision = req.body?.precision ?? req.query?.precision;
  const parsedPrecision = Number.parseInt(rawPrecision, 10);
  if (Number.isFinite(parsedPrecision)) {
    return Math.max(0, Math.min(6, parsedPrecision));
  }
  return getMilepostDecimalPlaces(req.user?.Agency_ID);
};

const roundToPrecision = (value, precision) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.parseFloat(parsed.toFixed(precision));
};

const normalizeInterpolationSource = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (['auto', 'track_mileposts', 'milepost_geometry'].includes(normalized)) {
    return normalized;
  }
  return 'auto';
};

/**
 * Track and Milepost Controller
 * Handles track-based distance calculations and milepost interpolation
 */

/**
 * Get structured track-search options for a subdivision
 * GET /tracks/search-options?subdivisionId=123
 */
exports.getTrackSearchOptions = async (req, res) => {
  try {
    const agencyId = req.user.Agency_ID;
    const subdivisionId = Number.parseInt(req.query.subdivisionId, 10);
    const hasSubdivisionFilter = Number.isFinite(subdivisionId);
    const subdivisionFilter = hasSubdivisionFilter ? 'AND t.Subdivision_ID = @Subdivision_ID' : '';

    const baseRequestBuilder = () => {
      const request = new db.Request()
        .input('Agency_ID', db.Int, agencyId);
      if (hasSubdivisionFilter) {
        request.input('Subdivision_ID', db.Int, subdivisionId);
      }
      return request;
    };

    const lineSegmentResult = await baseRequestBuilder().query(`
      SELECT DISTINCT LTRIM(RTRIM(t.LS)) AS Value
      FROM Tracks t
      INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
      WHERE s.Agency_ID = @Agency_ID
        ${subdivisionFilter}
        AND t.LS IS NOT NULL
        AND LTRIM(RTRIM(t.LS)) <> ''
      ORDER BY Value
    `);

    const trackTypeResult = await baseRequestBuilder().query(`
      SELECT DISTINCT LTRIM(RTRIM(t.Track_Type)) AS Value
      FROM Tracks t
      INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
      WHERE s.Agency_ID = @Agency_ID
        ${subdivisionFilter}
        AND t.Track_Type IS NOT NULL
        AND LTRIM(RTRIM(t.Track_Type)) <> ''
      ORDER BY Value
    `);

    const trackNumberResult = await baseRequestBuilder().query(`
      SELECT DISTINCT LTRIM(RTRIM(t.Track_Number)) AS Value
      FROM Tracks t
      INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
      WHERE s.Agency_ID = @Agency_ID
        ${subdivisionFilter}
        AND t.Track_Number IS NOT NULL
        AND LTRIM(RTRIM(t.Track_Number)) <> ''
      ORDER BY Value
    `);

    const configs = getFieldConfigurations(agencyId);

    const mergeUnique = (dbRows = [], configured = []) => {
      const values = new Set();
      dbRows.forEach((row) => {
        if (row?.Value) values.add(String(row.Value));
      });
      (configured || []).forEach((value) => {
        if (value) values.add(String(value));
      });
      return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    };

    res.json({
      success: true,
      data: {
        subdivisionId: hasSubdivisionFilter ? subdivisionId : null,
        lineSegments: mergeUnique(lineSegmentResult.recordset, configs?.lineSegment?.options),
        trackTypes: mergeUnique(trackTypeResult.recordset, configs?.trackType?.options),
        trackNumbers: mergeUnique(trackNumberResult.recordset, configs?.trackNumber?.options),
        milepostPrecision: getMilepostDecimalPlaces(agencyId),
        interpolation: getMilepostInterpolationConfig(agencyId),
      },
    });
  } catch (error) {
    console.error('Get track search options error:', error);
    res.status(500).json({ success: false, error: 'Failed to load track search options' });
  }
};

/**
 * Get milepost reference data for a subdivision
 * GET /tracks/mileposts/:subdivisionId
 */
exports.getMileposts = async (req, res) => {
  try {
    const { subdivisionId } = req.params;

    const request = new db.Request();
    const result = await request
      .input('Subdivision_ID', db.Int, subdivisionId)
      .query(`
        SELECT 
          Track_Milepost_ID,
          Subdivision_ID,
          Track_Type,
          Track_Number,
          Milepost,
          Latitude,
          Longitude,
          Elevation
        FROM Track_Mileposts
        WHERE Subdivision_ID = @Subdivision_ID
        ORDER BY Track_Type, Track_Number, Milepost
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Get mileposts error:', error);
    res.status(500).json({ error: 'Failed to get mileposts' });
  }
};

/**
 * Calculate track-based distance between two points
 * POST /tracks/calculate-distance
 * Body: { lat1, lon1, lat2, lon2, subdivisionId, trackType, trackNumber }
 */
exports.calculateDistance = async (req, res) => {
  try {
    const { lat1, lon1, lat2, lon2, subdivisionId, trackType, trackNumber } = req.body;

    // Get track geometry
    const request = new db.Request();
    const result = await request
      .input('Subdivision_ID', db.Int, subdivisionId)
      .input('Track_Type', db.VarChar, trackType)
      .input('Track_Number', db.VarChar, trackNumber)
      .query(`
        SELECT 
          Milepost,
          Latitude,
          Longitude
        FROM Track_Mileposts
        WHERE Subdivision_ID = @Subdivision_ID
          AND Track_Type = @Track_Type
          AND Track_Number = @Track_Number
        ORDER BY Milepost
      `);

    const mileposts = result.recordset;

    if (mileposts.length < 2) {
      return res.json({ distance: 0, method: 'straight-line' });
    }

    // Find closest mileposts to each point
    const mp1 = findClosestMilepost(lat1, lon1, mileposts);
    const mp2 = findClosestMilepost(lat2, lon2, mileposts);

    if (!mp1 || !mp2) {
      return res.json({ distance: 0, method: 'not-on-track' });
    }

    // Calculate distance along track
    const trackDistance = calculateTrackDistance(
      parseFloat(mp1.Milepost),
      parseFloat(mp2.Milepost),
      mileposts
    );

    res.json({
      distance: trackDistance,
      method: 'track-based',
      mp1: mp1.Milepost,
      mp2: mp2.Milepost,
    });
  } catch (error) {
    console.error('Calculate distance error:', error);
    res.status(500).json({ error: 'Failed to calculate distance' });
  }
};

/**
 * Interpolate milepost from GPS coordinates
 * POST /tracks/interpolate-milepost
 * Body: { latitude, longitude, subdivisionId }
 */
exports.interpolateMilepost = async (req, res) => {
  try {
    const { latitude, longitude, subdivisionId } = req.body;
    const precision = getPrecisionFromRequest(req);
    const interpolationConfig = getMilepostInterpolationConfig(req.user?.Agency_ID);
    const source = normalizeInterpolationSource(
      req.body?.source ?? req.query?.source ?? interpolationConfig.anchorSource
    );

    // Validate inputs
    if (!latitude || !longitude || !subdivisionId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: latitude, longitude, subdivisionId' 
      });
    }

    const { hasTrackMileposts, hasMPIsActive } = await getInterpolateSchemaFlags(false);

    const buildRequest = (pool) => pool.request()
      .input('Subdivision_ID', db.Int, subdivisionId)
      .input('Latitude', sql.Float, latitude)
      .input('Longitude', sql.Float, longitude);

    const queryTrackMileposts = async () => runQueryWithRetry(
      (pool) => buildRequest(pool),
      `
        SELECT TOP 10
          Milepost,
          Latitude,
          Longitude,
          (
            6371 * 2 * ASIN(
              SQRT(
                POWER(SIN((RADIANS(Latitude) - RADIANS(@Latitude)) / 2), 2) +
                COS(RADIANS(@Latitude)) * COS(RADIANS(Latitude)) *
                POWER(SIN((RADIANS(Longitude) - RADIANS(@Longitude)) / 2), 2)
              )
            )
          ) * 0.621371 AS Distance_Miles
        FROM Track_Mileposts
        WHERE Subdivision_ID = @Subdivision_ID
        ORDER BY Distance_Miles
      `,
      'interpolateMilepost.trackMileposts'
    );

    const queryMilepostGeometry = async (context = 'interpolateMilepost.milepostGeometryPrimary') =>
      runQueryWithRetry(
        (pool) => buildRequest(pool),
        `
        SELECT TOP 10
          MP AS Milepost,
          Latitude,
          Longitude,
          (
            6371 * 2 * ASIN(
              SQRT(
                POWER(SIN((RADIANS(Latitude) - RADIANS(@Latitude)) / 2), 2) +
                COS(RADIANS(@Latitude)) * COS(RADIANS(Latitude)) *
                POWER(SIN((RADIANS(Longitude) - RADIANS(@Longitude)) / 2), 2)
              )
            )
          ) * 0.621371 AS Distance_Miles
        FROM Milepost_Geometry
        WHERE Subdivision_ID = @Subdivision_ID
          ${hasMPIsActive ? 'AND Is_Active = 1' : ''}
        ORDER BY Distance_Miles
      `,
        context
      );

    let result;
    if (source === 'track_mileposts') {
      if (!hasTrackMileposts) {
        return res.status(404).json({ error: 'Track_Mileposts anchors not available' });
      }
      result = await queryTrackMileposts();
    } else if (source === 'milepost_geometry') {
      result = await queryMilepostGeometry();
    } else if (hasTrackMileposts) {
      result = await queryTrackMileposts();
      // Auto fallback: Track_Mileposts can exist but be empty for some agencies.
      if (result.recordset.length === 0) {
        result = await queryMilepostGeometry('interpolateMilepost.milepostGeometryFallback');
      }
    } else {
      result = await queryMilepostGeometry();
    }

    const nearbyPoints = result.recordset;

    if (nearbyPoints.length === 0) {
      return res.status(404).json({ error: 'No track data found' });
    }

    const closest = nearbyPoints[0];

    // If very close to a reference point, use it directly
    if (closest.Distance_Miles < 0.01) {
      return res.json({
        milepost: roundToPrecision(closest.Milepost, precision),
        distance: closest.Distance_Miles,
        method: 'exact',
        source,
      });
    }

    // Weighted interpolation using 2 closest points
    if (nearbyPoints.length >= 2) {
      const p1 = nearbyPoints[0];
      const p2 = nearbyPoints[1];
      
      const weight1 = 1 / p1.Distance_Miles;
      const weight2 = 1 / p2.Distance_Miles;
      const totalWeight = weight1 + weight2;
      
      const interpolated = 
        (parseFloat(p1.Milepost) * weight1 + parseFloat(p2.Milepost) * weight2) / totalWeight;

      return res.json({
        milepost: roundToPrecision(interpolated, precision),
        distance: closest.Distance_Miles,
        method: 'interpolated',
        source,
      });
    }

    // Fallback to closest point
    res.json({
      milepost: roundToPrecision(closest.Milepost, precision),
      distance: closest.Distance_Miles,
      method: 'closest',
      source,
    });
  } catch (error) {
    console.error('Interpolate milepost error:', error);
    res.status(500).json({ error: 'Failed to interpolate milepost' });
  }
};

/**
 * Track location search
 * POST /tracks/location-search
 * Body: { subdivisionId, milepost, ls?, trackType?, trackNumber? }
 */
exports.searchTrackLocation = async (req, res) => {
  try {
    const { subdivisionId, milepost, ls, trackType, trackNumber } = req.body;
    const precision = getPrecisionFromRequest(req);

    if (!subdivisionId || milepost === undefined || milepost === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: subdivisionId, milepost',
      });
    }

    const mpValue = parseFloat(milepost);
    if (Number.isNaN(mpValue)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid milepost value',
      });
    }

    const flagsResult = await new db.Request().query(`
      SELECT 
        COL_LENGTH('Milepost_Geometry', 'Track_Type') AS HasTrackType,
        COL_LENGTH('Milepost_Geometry', 'Track_Number') AS HasTrackNumber,
        COL_LENGTH('Milepost_Geometry', 'Is_Active') AS HasIsActive
    `);

    const flags = flagsResult.recordset[0] || {};
    const hasTrackType = flags.HasTrackType !== null;
    const hasTrackNumber = flags.HasTrackNumber !== null;
    const hasIsActive = flags.HasIsActive !== null;

    const mpRequest = new db.Request()
      .input('Subdivision_ID', db.Int, subdivisionId)
      .input('Milepost', sql.Float, mpValue)
      .input('Track_Type', db.VarChar, trackType || null)
      .input('Track_Number', db.VarChar, trackNumber || null);

    const trackTypeFilter = hasTrackType ? 'AND (@Track_Type IS NULL OR mg.Track_Type = @Track_Type)' : '';
    const trackNumberFilter = hasTrackNumber ? 'AND (@Track_Number IS NULL OR mg.Track_Number = @Track_Number)' : '';
    const activeFilter = hasIsActive ? 'AND mg.Is_Active = 1' : '';

    const mpResult = await mpRequest.query(`
      SELECT TOP 1
        mg.MP,
        mg.Latitude,
        mg.Longitude
        ${hasTrackType ? ', mg.Track_Type' : ''}
        ${hasTrackNumber ? ', mg.Track_Number' : ''}
      FROM Milepost_Geometry mg
      WHERE mg.Subdivision_ID = @Subdivision_ID
        AND mg.Latitude IS NOT NULL
        AND mg.Longitude IS NOT NULL
        ${activeFilter}
        ${trackTypeFilter}
        ${trackNumberFilter}
      ORDER BY ABS(mg.MP - @Milepost)
    `);

    if (!mpResult.recordset.length) {
      return res.status(404).json({
        success: false,
        error: 'No milepost geometry found for the specified criteria',
      });
    }

    const milepostRow = mpResult.recordset[0];

    const trackRequest = new db.Request()
      .input('Subdivision_ID', db.Int, subdivisionId)
      .input('LS', db.VarChar, ls || null)
      .input('Track_Type', db.VarChar, trackType || null)
      .input('Track_Number', db.VarChar, trackNumber || null)
      .input('Milepost', sql.Float, mpValue);

    const trackResult = await trackRequest.query(`
      SELECT TOP 1
        Track_ID,
        LS,
        Track_Type,
        Track_Number,
        BMP,
        EMP,
        Asset_Name
      FROM Tracks
      WHERE Subdivision_ID = @Subdivision_ID
        AND (@LS IS NULL OR LS = @LS)
        AND (@Track_Type IS NULL OR Track_Type = @Track_Type)
        AND (@Track_Number IS NULL OR Track_Number = @Track_Number)
        AND (
          BMP IS NULL OR EMP IS NULL OR
          @Milepost BETWEEN BMP AND EMP
        )
      ORDER BY ABS(@Milepost - (ISNULL(BMP, @Milepost) + ISNULL(EMP, @Milepost)) / 2.0)
    `);

    const trackRow = trackResult.recordset[0] || null;

    res.json({
      success: true,
      data: {
        subdivisionId,
        lineSegment: trackRow?.LS || ls || null,
        milepost: roundToPrecision(milepostRow.MP, precision),
        latitude: parseFloat(milepostRow.Latitude),
        longitude: parseFloat(milepostRow.Longitude),
        trackType: milepostRow.Track_Type || trackType || trackRow?.Track_Type || null,
        trackNumber: milepostRow.Track_Number || trackNumber || trackRow?.Track_Number || null,
        track: trackRow,
        milepostPrecision: precision,
      },
    });
  } catch (error) {
    console.error('Track location search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search track location' });
  }
};

// Helper functions
function findClosestMilepost(lat, lon, mileposts) {
  let closest = null;
  let minDistance = Infinity;

  mileposts.forEach(mp => {
    const distance = calculateGPSDistance(lat, lon, mp.Latitude, mp.Longitude);
    if (distance < minDistance) {
      minDistance = distance;
      closest = { ...mp, distance };
    }
  });

  return closest;
}

function calculateGPSDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateTrackDistance(mp1, mp2, trackGeometry) {
  if (!trackGeometry || trackGeometry.length < 2) {
    return Math.abs(mp2 - mp1);
  }

  const start = Math.min(mp1, mp2);
  const end = Math.max(mp1, mp2);

  const relevantPoints = trackGeometry
    .filter(point => {
      const mp = parseFloat(point.Milepost);
      return mp >= start && mp <= end;
    })
    .sort((a, b) => parseFloat(a.Milepost) - parseFloat(b.Milepost));

  if (relevantPoints.length < 2) {
    return Math.abs(mp2 - mp1);
  }

  let totalDistance = 0;
  for (let i = 0; i < relevantPoints.length - 1; i++) {
    const p1 = relevantPoints[i];
    const p2 = relevantPoints[i + 1];
    
    totalDistance += calculateGPSDistance(
      p1.Latitude,
      p1.Longitude,
      p2.Latitude,
      p2.Longitude
    );
  }

  return Math.round(totalDistance * 100) / 100;
}
