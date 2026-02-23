const BaseModel = require('./BaseModel');

class Pin extends BaseModel {
  constructor() {
    super('Pins');
  }

  async create(pinData) {
    const {
      authorityId,
      pinTypeId,
      latitude,
      longitude,
      trackType = null,
      trackNumber = null,
      mp = null,
      notes = null,
      photoUrl = null
    } = pinData;

    const query = `
      INSERT INTO Pins (
        Authority_ID, Pin_Type_ID, Latitude, Longitude,
        Track_Type, Track_Number, MP, Notes, Photo_URL
      )
      OUTPUT INSERTED.*
      VALUES (
        @authorityId, @pinTypeId, @latitude, @longitude,
        @trackType, @trackNumber, @mp, @notes, @photoUrl
      )
    `;

    const result = await this.executeQuery(query, {
      authorityId,
      pinTypeId,
      latitude,
      longitude,
      trackType,
      trackNumber,
      mp,
      notes,
      photoUrl
    });

    return result.recordset[0];
  }

  async getAuthorityPins(authorityId) {
    const query = `
      SELECT 
        p.*,
        pt.Pin_Category,
        pt.Pin_Subtype,
        pt.Color,
        pt.Icon_URL
      FROM Pins p
      INNER JOIN Pin_Types pt ON p.Pin_Type_ID = pt.Pin_Type_ID
      WHERE p.Authority_ID = @authorityId
      ORDER BY p.Created_Date DESC
    `;

    const result = await this.executeQuery(query, { authorityId });
    return result.recordset;
  }

  async getTripReport(authorityId) {
    const query = `
      SELECT 
        p.*,
        pt.Pin_Category,
        pt.Pin_Subtype,
        pt.Color,
        a.Begin_MP,
        a.End_MP,
        a.Track_Type,
        a.Track_Number,
        u.Employee_Name,
        s.Subdivision_Code,
        ag.Agency_Name
      FROM Pins p
      INNER JOIN Pin_Types pt ON p.Pin_Type_ID = pt.Pin_Type_ID
      INNER JOIN Authorities a ON p.Authority_ID = a.Authority_ID
      INNER JOIN Users u ON a.User_ID = u.User_ID
      INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
      INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
      WHERE p.Authority_ID = @authorityId
      ORDER BY p.Created_Date
    `;

    const result = await this.executeQuery(query, { authorityId });
    return result.recordset;
  }

  async update(pinId, pinData) {
    const {
      pinTypeId,
      latitude,
      longitude,
      trackType = null,
      trackNumber = null,
      mp = null,
      notes = null,
      photoUrl = null
    } = pinData;

    const query = `
      UPDATE Pins
      SET
        Pin_Type_ID = COALESCE(@pinTypeId, Pin_Type_ID),
        Latitude = COALESCE(@latitude, Latitude),
        Longitude = COALESCE(@longitude, Longitude),
        Track_Type = @trackType,
        Track_Number = @trackNumber,
        MP = @mp,
        Notes = @notes,
        Photo_URL = @photoUrl,
        Modified_Date = GETDATE()
      OUTPUT INSERTED.*
      WHERE Pin_ID = @pinId
    `;

    const result = await this.executeQuery(query, {
      pinId,
      pinTypeId: pinTypeId || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      trackType,
      trackNumber,
      mp,
      notes,
      photoUrl
    });

    return result.recordset[0] || null;
  }
}

module.exports = new Pin();
