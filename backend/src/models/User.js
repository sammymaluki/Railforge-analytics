const BaseModel = require('./BaseModel');
const bcrypt = require('bcryptjs');

class User extends BaseModel {
  constructor() {
    super('Users');
  }

  async create(userData) {
    const {
      agencyId,
      username,
      password,
      employeeName,
      employeeContact,
      email,
      role = 'Field_Worker'
    } = userData;

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO Users (
        Agency_ID, Username, Password_Hash, Employee_Name, 
        Employee_Contact, Email, Role, Is_Active
      )
      OUTPUT INSERTED.*
      VALUES (@agencyId, @username, @passwordHash, @employeeName, 
              @employeeContact, @email, @role, 1)
    `;

    const result = await this.executeQuery(query, {
      agencyId,
      username,
      passwordHash,
      employeeName,
      employeeContact,
      email,
      role
    });

    return result.recordset[0];
  }

  async findByUsername(username) {
    const query = `
      SELECT u.*, a.Agency_CD, a.Agency_Name
      FROM Users u
      INNER JOIN Agencies a ON u.Agency_ID = a.Agency_ID
      WHERE u.Username = @username AND u.Is_Active = 1
    `;

    const result = await this.executeQuery(query, { username });
    return result.recordset[0];
  }

  async findById(userId) {
    const query = `
      SELECT u.*, a.Agency_CD, a.Agency_Name
      FROM Users u
      INNER JOIN Agencies a ON u.Agency_ID = a.Agency_ID
      WHERE u.User_ID = @userId AND u.Is_Active = 1
    `;

    const result = await this.executeQuery(query, { userId });
    return result.recordset[0];
  }

  async findAll({ page = 1, limit = 20, search = '', agencyId = null }) {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.*, a.Agency_CD, a.Agency_Name
      FROM Users u
      INNER JOIN Agencies a ON u.Agency_ID = a.Agency_ID
      WHERE u.Is_Active = 1
    `;
    
    const params = {};
    
    if (agencyId) {
      query += ' AND u.Agency_ID = @agencyId';
      params.agencyId = agencyId;
    }
    
    if (search) {
      query += ' AND (u.Username LIKE @search OR u.Employee_Name LIKE @search OR u.Email LIKE @search)';
      params.search = `%${search}%`;
    }
    
    query += `
      ORDER BY u.Employee_Name
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;
    
    params.offset = offset;
    params.limit = limit;
    
    const result = await this.executeQuery(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM Users WHERE Is_Active = 1';
    const countParams = {};
    
    if (agencyId) {
      countQuery += ' AND Agency_ID = @agencyId';
      countParams.agencyId = agencyId;
    }
    
    if (search) {
      countQuery += ' AND (Username LIKE @search OR Employee_Name LIKE @search OR Email LIKE @search)';
      countParams.search = `%${search}%`;
    }
    
    const countResult = await this.executeQuery(countQuery, countParams);
    
    return {
      users: result.recordset,
      total: countResult.recordset[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult.recordset[0].total / limit)
    };
  }

  async findByAgency(agencyId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT u.*, a.Agency_CD, a.Agency_Name
      FROM Users u
      INNER JOIN Agencies a ON u.Agency_ID = a.Agency_ID
      WHERE u.Agency_ID = @agencyId AND u.Is_Active = 1
      ORDER BY u.Employee_Name
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const result = await this.executeQuery(query, {
      agencyId,
      offset,
      limit
    });

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM Users
      WHERE Agency_ID = @agencyId AND Is_Active = 1
    `;

    const countResult = await this.executeQuery(countQuery, { agencyId });

    return {
      users: result.recordset,
      total: countResult.recordset[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult.recordset[0].total / limit)
    };
  }

  async update(userId, updateData) {
    const allowedFields = [
      'Employee_Name',
      'Employee_Contact',
      'Email',
      'Role',
      'Is_Active',
      'Agency_ID',
      'Password_Hash'
    ];

    const updates = [];
    const params = { userId };

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
      UPDATE Users
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE User_ID = @userId
    `;

    const result = await this.executeQuery(query, params);
    return result.recordset[0];
  }

  async updatePassword(userId, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const query = `
      UPDATE Users
      SET Password_Hash = @passwordHash, Modified_Date = GETDATE()
      WHERE User_ID = @userId
    `;

    await this.executeQuery(query, { userId, passwordHash });
    return true;
  }

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  async updateLastLogin(userId) {
    const query = `
      UPDATE Users
      SET Last_Login = GETDATE()
      WHERE User_ID = @userId
    `;

    await this.executeQuery(query, { userId });
    return true;
  }

  async deactivate(userId) {
    const query = `
      UPDATE Users
      SET Is_Active = 0, Modified_Date = GETDATE()
      WHERE User_ID = @userId
    `;

    await this.executeQuery(query, { userId });
    return true;
  }
}

module.exports = new User();
