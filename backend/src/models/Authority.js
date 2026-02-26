const BaseModel = require('./BaseModel');
const { sql, getConnectionWithRecovery } = require('../config/database');

class Authority extends BaseModel {
  constructor() {
    super('Authorities');
    this.authorityTypeCache = null;
    this.authorityTypeCacheTtlMs = 5 * 60 * 1000;
  }

  async create(authorityData) {
    const {
      userId,
      authorityType,
      subdivisionId,
      beginMP,
      endMP,
      trackType,
      trackNumber,
      employeeNameDisplay = null,
      employeeContactDisplay = null,
      expirationTime = null
    } = authorityData;
    const normalizedAuthorityType = await this.normalizeAuthorityType(authorityType);

    // Use stored procedure for authority creation with overlap check
    const result = await this.executeStoredProcedure('sp_CreateAuthority', {
      userID: userId,
      authorityType: normalizedAuthorityType,
      subdivisionID: subdivisionId,
      beginMP,
      endMP,
      trackType,
      trackNumber,
      employeeNameDisplay,
      employeeContactDisplay,
      expirationTime,
      output_authorityID: { type: sql.Int, value: null },
      output_hasOverlap: { type: sql.Bit, value: null },
      output_overlapDetails: { type: sql.NVarChar(sql.MAX), value: null }
    });

    const authorityId = result.output.authorityID;
    
    // Fetch the created authority record
    const authority = await this.getAuthorityById(authorityId);

    return {
      authorityId,
      hasOverlap: result.output.hasOverlap,
      overlapDetails: result.output.overlapDetails ? 
        JSON.parse(result.output.overlapDetails) : [],
      authority
    };
  }

  async getAllowedAuthorityTypes() {
    const now = Date.now();
    if (this.authorityTypeCache && (now - this.authorityTypeCache.fetchedAt) < this.authorityTypeCacheTtlMs) {
      return this.authorityTypeCache.values;
    }

    try {
      const pool = await getConnectionWithRecovery();
      const result = await pool.request().query(`
        SELECT cc.definition AS Definition
        FROM sys.check_constraints cc
        INNER JOIN sys.columns c
          ON cc.parent_object_id = c.object_id
          AND cc.parent_column_id = c.column_id
        WHERE cc.parent_object_id = OBJECT_ID('Authorities')
          AND c.name = 'Authority_Type'
      `);

      const definition = result.recordset[0]?.Definition || '';
      const values = [];
      const regex = /'([^']+)'/g;
      let match = regex.exec(definition);
      while (match) {
        values.push(match[1]);
        match = regex.exec(definition);
      }

      const deduped = [...new Set(values)];
      this.authorityTypeCache = {
        values: deduped,
        fetchedAt: now,
      };
      return deduped;
    } catch (error) {
      return [];
    }
  }

  async normalizeAuthorityType(inputType) {
    if (!inputType) return inputType;

    const allowed = await this.getAllowedAuthorityTypes();
    if (!allowed.length) return inputType;

    const contains = (candidate) => allowed.some((value) => String(value).toLowerCase() === String(candidate).toLowerCase());

    if (contains(inputType)) {
      return allowed.find((value) => String(value).toLowerCase() === String(inputType).toLowerCase()) || inputType;
    }

    const canonicalCandidates = {
      Track_Authority: ['Track_Authority', 'Track Authority', 'Track_Authorit', 'Track'],
      Lone_Worker_Authority: ['Lone_Worker_Authority', 'Lone Worker Authority', 'Lone_Worker', 'Lone Worker', 'Lone_Worker_Authorit']
    };

    const candidates = canonicalCandidates[inputType] || [inputType];
    for (const candidate of candidates) {
      if (contains(candidate)) {
        return allowed.find((value) => String(value).toLowerCase() === String(candidate).toLowerCase()) || candidate;
      }
    }

    return inputType;
  }

  async getActiveAuthorities(subdivisionId = null, trackType = null, trackNumber = null, agencyId = null) {
    let query = `
      SELECT 
        a.*,
        u.Employee_Name,
        u.Employee_Contact,
        u.Username,
        s.Subdivision_Code,
        s.Subdivision_Name,
        ag.Agency_CD,
        ag.Agency_Name,
        DATEDIFF(MINUTE, a.Start_Time, GETDATE()) AS Minutes_Active,
        (SELECT COUNT(*) FROM Pins p WHERE p.Authority_ID = a.Authority_ID) AS Pin_Count
      FROM Authorities a
      INNER JOIN Users u ON a.User_ID = u.User_ID
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
      WHERE a.Is_Active = 1
    `;

    const params = {};

    if (subdivisionId) {
      query += ' AND a.Subdivision_ID = @subdivisionId';
      params.subdivisionId = subdivisionId;
    }

    if (trackType) {
      query += ' AND a.Track_Type = @trackType';
      params.trackType = trackType;
    }

    if (trackNumber) {
      query += ' AND a.Track_Number = @trackNumber';
      params.trackNumber = trackNumber;
    }

    if (agencyId) {
      query += ' AND ag.Agency_ID = @agencyId';
      params.agencyId = agencyId;
    }

    query += ' ORDER BY a.Start_Time DESC';

    const result = await this.executeQuery(query, params);
    return result.recordset;
  }

  async getAuthorityById(authorityId) {
    const query = `
      SELECT 
        a.*,
        u.Employee_Name,
        u.Employee_Contact,
        u.Username,
        u.Email,
        ag.Agency_ID,
        s.Subdivision_Code,
        s.Subdivision_Name,
        ag.Agency_CD,
        ag.Agency_Name,
        (SELECT COUNT(*) FROM Pins p WHERE p.Authority_ID = a.Authority_ID) AS Pin_Count,
        (SELECT COUNT(*) FROM GPS_Logs g WHERE g.Authority_ID = a.Authority_ID) AS GPS_Log_Count
      FROM Authorities a
      INNER JOIN Users u ON a.User_ID = u.User_ID
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
      WHERE a.Authority_ID = @authorityId
    `;

    const result = await this.executeQuery(query, { authorityId });
    return result.recordset[0];
  }

  async getUserAuthorities(userId, activeOnly = true) {
    let query = `
      SELECT 
        a.*,
        s.Subdivision_Code,
        s.Subdivision_Name,
        ag.Agency_Name,
        DATEDIFF(MINUTE, a.Start_Time, GETDATE()) AS Minutes_Active,
        CASE 
          WHEN a.Expiration_Time IS NOT NULL AND GETDATE() > a.Expiration_Time THEN 'Expired'
          WHEN a.End_Tracking_Confirmed = 1 THEN 'Completed'
          ELSE 'Active'
        END AS Status
      FROM Authorities a
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
      WHERE a.User_ID = @userId
    `;

    if (activeOnly) {
      query += ' AND a.Is_Active = 1';
    }

    query += ' ORDER BY a.Start_Time DESC';

    const result = await this.executeQuery(query, { userId });
    return result.recordset;
  }

  async checkOverlap(authorityData, excludeAuthorityId = null) {
    const {
      subdivisionId,
      trackType,
      trackNumber,
      beginMP,
      endMP
    } = authorityData;

    const query = `
      SELECT * FROM fn_CheckAuthorityOverlap(
        @subdivisionId, 
        @trackType, 
        @trackNumber, 
        @beginMP, 
        @endMP, 
        @excludeAuthorityId
      )
    `;

    const result = await this.executeQuery(query, {
      subdivisionId,
      trackType,
      trackNumber,
      beginMP,
      endMP,
      excludeAuthorityId
    });

    return result.recordset;
  }

  async endAuthority(authorityId, userId, confirmEndTracking = true) {
    const query = `
      UPDATE Authorities
      SET 
        Is_Active = 0,
        End_Tracking_Time = GETDATE(),
        End_Tracking_Confirmed = @confirmEndTracking,
        Modified_Date = GETDATE()
      OUTPUT INSERTED.*
      WHERE Authority_ID = @authorityId 
        AND User_ID = @userId
        AND Is_Active = 1
    `;

    const result = await this.executeQuery(query, {
      authorityId,
      userId,
      confirmEndTracking: confirmEndTracking ? 1 : 0
    });

    if (result.recordset.length === 0) {
      throw new Error('Authority not found or already ended');
    }

    // Update trip end time
    const tripQuery = `
      UPDATE Trips
      SET End_Time = GETDATE()
      WHERE Authority_ID = @authorityId AND End_Time IS NULL
    `;

    await this.executeQuery(tripQuery, { authorityId });

    return result.recordset[0];
  }

  async checkProximity(authorityId, currentLat, currentLon, maxDistance = 1.0) {
    const result = await this.executeStoredProcedure('sp_CheckProximity', {
      authorityID: authorityId,
      currentLatitude: currentLat,
      currentLongitude: currentLon,
      maxDistanceMiles: maxDistance
    });

    return result.recordset;
  }

  async calculateTrackDistance(subdivisionId, startMP, endMP) {
    const result = await this.executeStoredProcedure('sp_CalculateTrackDistance', {
      subdivisionID: subdivisionId,
      startMP,
      endMP,
      output_trackDistanceMiles: sql.Decimal(10, 4)
    });

    return result.output.trackDistanceMiles;
  }

  async getAuthorityStats(agencyId, startDate = null, endDate = null) {
    let query = `
      SELECT 
        COUNT(*) as Total_Authorities,
        SUM(CASE WHEN Is_Active = 1 THEN 1 ELSE 0 END) as Active_Authorities,
        SUM(CASE WHEN End_Tracking_Confirmed = 1 THEN 1 ELSE 0 END) as Completed_Authorities,
        AVG(DATEDIFF(MINUTE, Start_Time, ISNULL(End_Tracking_Time, GETDATE()))) as Avg_Duration_Minutes
      FROM Authorities a
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      WHERE s.Agency_ID = @agencyId
    `;

    const params = { agencyId };

    if (startDate) {
      query += ' AND a.Created_Date >= @startDate';
      params.startDate = startDate;
    }

    if (endDate) {
      query += ' AND a.Created_Date <= @endDate';
      params.endDate = endDate;
    }

    const result = await this.executeQuery(query, params);
    return result.recordset[0];
  }

  async getAuthorityHistory(agencyId, filters = {}) {
    let query = `
      SELECT 
        a.*,
        u.Employee_Name,
        u.Employee_Contact,
        u.Username,
        s.Subdivision_Code,
        s.Subdivision_Name,
        ag.Agency_CD,
        ag.Agency_Name,
        DATEDIFF(MINUTE, a.Start_Time, ISNULL(a.End_Tracking_Time, GETDATE())) AS Duration_Minutes,
        CASE 
          WHEN a.Is_Active = 1 THEN 'Active'
          WHEN a.Expiration_Time IS NOT NULL AND GETDATE() > a.Expiration_Time THEN 'Expired'
          WHEN a.End_Tracking_Confirmed = 1 THEN 'Completed'
          ELSE 'Ended'
        END AS Status
      FROM Authorities a
      INNER JOIN Users u ON a.User_ID = u.User_ID
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
      WHERE s.Agency_ID = @agencyId
    `;

    const params = { agencyId };

    if (filters.startDate) {
      query += ' AND a.Start_Time >= @startDate';
      params.startDate = filters.startDate;
    }

    if (filters.endDate) {
      query += ' AND a.Start_Time <= @endDate';
      params.endDate = filters.endDate;
    }

    if (filters.authorityType) {
      query += ' AND a.Authority_Type = @authorityType';
      params.authorityType = filters.authorityType;
    }

    if (filters.subdivision) {
      query += ' AND s.Subdivision_Code = @subdivision';
      params.subdivision = filters.subdivision;
    }

    if (filters.employeeName) {
      query += ' AND u.Employee_Name LIKE @employeeName';
      params.employeeName = `%${filters.employeeName}%`;
    }

    query += ' ORDER BY a.Start_Time DESC';

    const result = await this.executeQuery(query, params);
    return result.recordset;
  }

  async getAuthorityOverlaps(agencyId) {
    const query = `
      SELECT 
        ao.*,
        a1.Authority_Type AS Authority1_Type,
        a1.Begin_MP AS Authority1_Begin_MP,
        a1.End_MP AS Authority1_End_MP,
        a1.Track_Type AS Authority1_Track_Type,
        a1.Track_Number AS Authority1_Track_Number,
        a1.Start_Time AS Authority1_Start_Time,
        u1.Employee_Name AS Authority1_Employee,
        u1.Employee_Contact AS Authority1_Contact,
        s1.Subdivision_Code AS Authority1_Subdivision,
        a2.Authority_Type AS Authority2_Type,
        a2.Begin_MP AS Authority2_Begin_MP,
        a2.End_MP AS Authority2_End_MP,
        a2.Track_Type AS Authority2_Track_Type,
        a2.Track_Number AS Authority2_Track_Number,
        a2.Start_Time AS Authority2_Start_Time,
        u2.Employee_Name AS Authority2_Employee,
        u2.Employee_Contact AS Authority2_Contact,
        s2.Subdivision_Code AS Authority2_Subdivision,
        CASE 
          WHEN ao.Overlap_End_MP - ao.Overlap_Begin_MP > 5 THEN 'Critical'
          WHEN ao.Overlap_End_MP - ao.Overlap_Begin_MP > 2 THEN 'High'
          WHEN ao.Overlap_End_MP - ao.Overlap_Begin_MP > 0.5 THEN 'Medium'
          ELSE 'Low'
        END AS Severity
      FROM Authority_Overlaps ao
      INNER JOIN Authorities a1 ON ao.Authority1_ID = a1.Authority_ID
      INNER JOIN Authorities a2 ON ao.Authority2_ID = a2.Authority_ID
      INNER JOIN Users u1 ON a1.User_ID = u1.User_ID
      INNER JOIN Users u2 ON a2.User_ID = u2.User_ID
      INNER JOIN Subdivisions s1 ON a1.Subdivision_ID = s1.Subdivision_ID
      INNER JOIN Subdivisions s2 ON a2.Subdivision_ID = s2.Subdivision_ID
      WHERE s1.Agency_ID = @agencyId
        AND a1.Is_Active = 1
        AND a2.Is_Active = 1
        AND ao.Is_Resolved = 0
      ORDER BY ao.Overlap_Detected_Time DESC
    `;

    const result = await this.executeQuery(query, { agencyId });
    return result.recordset;
  }

  async getOverlapById(overlapId) {
    const query = `
      SELECT TOP 1
        ao.Overlap_ID,
        s1.Agency_ID
      FROM Authority_Overlaps ao
      INNER JOIN Authorities a1 ON ao.Authority1_ID = a1.Authority_ID
      INNER JOIN Subdivisions s1 ON a1.Subdivision_ID = s1.Subdivision_ID
      WHERE ao.Overlap_ID = @overlapId
    `;

    const result = await this.executeQuery(query, { overlapId });
    return result.recordset[0] || null;
  }

  async resolveOverlap(overlapId, notes = null) {
    const query = `
      UPDATE Authority_Overlaps
      SET Is_Resolved = 1,
          Resolved_Time = GETDATE(),
          Notes = @notes
      WHERE Overlap_ID = @overlapId
    `;

    await this.executeQuery(query, { overlapId, notes });
    return true;
  }
}

module.exports = new Authority();
