const BaseModel = require('./BaseModel');

class AlertConfiguration extends BaseModel {
  constructor() {
    super('Alert_Configurations');
  }

  async getAgencyConfigurations(agencyId) {
    const query = `
      SELECT * 
      FROM Alert_Configurations 
      WHERE Agency_ID = @agencyId 
        AND Is_Active = 1
      ORDER BY Config_Type, Distance_Miles DESC
    `;

    const result = await this.executeQuery(query, { agencyId });
    return result.recordset;
  }

  async getBoundaryAlerts(agencyId) {
    const query = `
      SELECT * 
      FROM Alert_Configurations 
      WHERE Agency_ID = @agencyId 
        AND Config_Type = 'Boundary_Alert'
        AND Is_Active = 1
      ORDER BY Distance_Miles DESC
    `;

    const result = await this.executeQuery(query, { agencyId });
    return result.recordset;
  }

  async getProximityAlerts(agencyId) {
    const query = `
      SELECT * 
      FROM Alert_Configurations 
      WHERE Agency_ID = @agencyId 
        AND Config_Type = 'Proximity_Alert'
        AND Is_Active = 1
      ORDER BY Distance_Miles DESC
    `;

    const result = await this.executeQuery(query, { agencyId });
    return result.recordset;
  }

  async getByType(agencyId, configType) {
    const query = `
      SELECT *
      FROM Alert_Configurations
      WHERE Agency_ID = @agencyId
        AND Config_Type = @configType
        AND Is_Active = 1
      ORDER BY Distance_Miles DESC, Time_Minutes DESC
    `;

    const result = await this.executeQuery(query, { agencyId, configType });
    return result.recordset;
  }

  async updateConfiguration(configId, updateData) {
    const allowedFields = [
      'Distance_Miles',
      'Message_Template',
      'Sound_File',
      'Vibration_Pattern',
      'Is_Active',
      'Time_Minutes',
      'Description',
      'Alert_Level',
      'Config_Type'
    ];

    const updates = [];
    const params = { configId };

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
      UPDATE Alert_Configurations
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE Config_ID = @configId
    `;

    const result = await this.executeQuery(query, params);
    return result.recordset[0];
  }

  // Backward-compatible alias used by controllers.
  async update(configId, updateData) {
    return this.updateConfiguration(configId, updateData);
  }

  async createConfiguration(configData) {
    const {
      agencyId,
      configType,
      alertLevel,
      distanceMiles,
      messageTemplate = null,
      soundFile = null,
      vibrationPattern = null,
      timeMinutes = null,
      description = null
    } = configData;

    const query = `
      INSERT INTO Alert_Configurations (
        Agency_ID, Config_Type, Alert_Level, Distance_Miles,
        Message_Template, Sound_File, Vibration_Pattern, Is_Active, Time_Minutes, Description
      )
      OUTPUT INSERTED.*
      VALUES (
        @agencyId, @configType, @alertLevel, @distanceMiles,
        @messageTemplate, @soundFile, @vibrationPattern, 1, @timeMinutes, @description
      )
    `;

    const result = await this.executeQuery(query, {
      agencyId,
      configType,
      alertLevel,
      distanceMiles,
      messageTemplate,
      soundFile,
      vibrationPattern,
      timeMinutes,
      description
    });

    return result.recordset[0];
  }

  // Backward-compatible alias used by controllers.
  async create(configData) {
    return this.createConfiguration(configData);
  }

  async getAlertForDistance(agencyId, configType, distance) {
    const query = `
      SELECT TOP 1 *
      FROM Alert_Configurations
      WHERE Agency_ID = @agencyId
        AND Config_Type = @configType
        AND Distance_Miles >= @distance
        AND Is_Active = 1
      ORDER BY Distance_Miles ASC
    `;

    const result = await this.executeQuery(query, {
      agencyId,
      configType,
      distance
    });

    return result.recordset[0];
  }
}

module.exports = new AlertConfiguration();
