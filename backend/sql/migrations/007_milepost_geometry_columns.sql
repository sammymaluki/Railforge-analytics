-- Add Track_Type, Track_Number, Is_Active to Milepost_Geometry if missing
USE [HerzogAuthority]
GO

IF COL_LENGTH('Milepost_Geometry', 'Track_Type') IS NULL
BEGIN
    ALTER TABLE Milepost_Geometry
    ADD Track_Type VARCHAR(20) NULL;
    PRINT 'Added Track_Type to Milepost_Geometry';
END
ELSE
    PRINT 'Track_Type already exists on Milepost_Geometry';
GO

IF COL_LENGTH('Milepost_Geometry', 'Track_Number') IS NULL
BEGIN
    ALTER TABLE Milepost_Geometry
    ADD Track_Number VARCHAR(20) NULL;
    PRINT 'Added Track_Number to Milepost_Geometry';
END
ELSE
    PRINT 'Track_Number already exists on Milepost_Geometry';
GO

IF COL_LENGTH('Milepost_Geometry', 'Is_Active') IS NULL
BEGIN
    ALTER TABLE Milepost_Geometry
    ADD Is_Active BIT DEFAULT 1;
    PRINT 'Added Is_Active to Milepost_Geometry';
END
ELSE
    PRINT 'Is_Active already exists on Milepost_Geometry';
GO

-- Optional: backfill Is_Active to 1 for existing rows
UPDATE Milepost_Geometry
SET Is_Active = 1
WHERE Is_Active IS NULL;
GO
