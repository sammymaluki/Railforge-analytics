const BaseModel = require('./BaseModel');

class Agency extends BaseModel {
  constructor() {
    super('Agencies');
  }

  async findAll({ page = 1, limit = 20, search = '' }) {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        a.*,
        COUNT(u.User_ID) as userCount
      FROM Agencies a
      LEFT JOIN Users u ON a.Agency_ID = u.Agency_ID
      WHERE a.Is_Active = 1
    `;
    
    const params = {};
    
    if (search) {
      query += ' AND (a.Agency_CD LIKE @search OR a.Agency_Name LIKE @search)';
      params.search = `%${search}%`;
    }
    
    query += `
      GROUP BY a.Agency_ID, a.Agency_CD, a.Agency_Name, a.Region, a.Contact_Email, a.Contact_Phone, a.Is_Active, a.Created_Date, a.Modified_Date
      ORDER BY a.Agency_Name
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;
    
    params.offset = offset;
    params.limit = limit;
    
    const result = await this.executeQuery(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(DISTINCT a.Agency_ID) as total FROM Agencies a WHERE a.Is_Active = 1';
    if (search) {
      countQuery += ' AND (a.Agency_CD LIKE @search OR a.Agency_Name LIKE @search)';
    }
    
    const countResult = await this.executeQuery(countQuery, search ? { search: `%${search}%` } : {});
    
    return {
      agencies: result.recordset,
      total: countResult.recordset[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult.recordset[0].total / limit)
    };
  }

  async findById(agencyId) {
    const query = 'SELECT * FROM Agencies WHERE Agency_ID = @agencyId AND Is_Active = 1';
    
    const result = await this.executeQuery(query, { agencyId });
    return result.recordset[0];
  }

  async findByCode(agencyCode) {
    const query = 'SELECT * FROM Agencies WHERE Agency_CD = @agencyCode AND Is_Active = 1';
    
    const result = await this.executeQuery(query, { agencyCode });
    return result.recordset[0];
  }

  async create(agencyData) {
    const { agencyCD, agencyName, region, contactEmail, contactPhone } = agencyData;
    
    const query = `
      INSERT INTO Agencies (Agency_CD, Agency_Name, Region, Contact_Email, Contact_Phone)
      OUTPUT INSERTED.*
      VALUES (@agencyCD, @agencyName, @region, @contactEmail, @contactPhone)
    `;
    
    const result = await this.executeQuery(query, {
      agencyCD,
      agencyName,
      region,
      contactEmail,
      contactPhone
    });
    
    return result.recordset[0];
  }

  async update(agencyId, updateData) {
    const allowedFields = [
      'Agency_Name',
      'Region',
      'Contact_Email',
      'Contact_Phone',
      'Is_Active'
    ];
    
    const updates = [];
    const params = { agencyId };
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        updates.push(`${key} = @${key}`);
        params[key] = updateData[key];
      }
    });
    
    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    updates.push('Modified_Date = GETDATE()');
    
    const query = `
      UPDATE Agencies
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE Agency_ID = @agencyId
    `;
    
    const result = await this.executeQuery(query, params);
    return result.recordset[0];
  }

  async deactivate(agencyId) {
    const query = `
      UPDATE Agencies
      SET Is_Active = 0, Modified_Date = GETDATE()
      WHERE Agency_ID = @agencyId
    `;
    
    await this.executeQuery(query, { agencyId });
    return true;
  }
}

module.exports = new Agency();