-- Tracks and Milepost Geometry Tables
USE [HerzogAuthority]
GO

-- 4. Tracks Table (Track Segments & Assets)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tracks')
BEGIN
    CREATE TABLE Tracks (
        Track_ID INT PRIMARY KEY IDENTITY(1,1),
        Subdivision_ID INT FOREIGN KEY REFERENCES Subdivisions(Subdivision_ID),
        LS VARCHAR(50), -- Line Segment
        Track_Type VARCHAR(20) CHECK (Track_Type IN ('Main', 'Yard', 'Siding', 'Storage', 'X_Over', 'Other')),
        Track_Number VARCHAR(20),
        Diverging_Track_Type VARCHAR(20),
        Diverging_Track_Number VARCHAR(20),
        Facing_Direction VARCHAR(10),
        MP_Suffix VARCHAR(10),
        BMP DECIMAL(10,4), -- Begin Milepost
        EMP DECIMAL(10,4), -- End Milepost
        Asset_Name NVARCHAR(200),
        Asset_Type VARCHAR(50) CHECK (Asset_Type IN ('Switch', 'Signal', 'Crossing', 'Other')),
        Asset_SubType VARCHAR(50), -- e.g., 'HT_Switch', 'PWR_Switch'
        Asset_ID VARCHAR(100),
        DOT_Number VARCHAR(50),
        Legacy_Asset_Number VARCHAR(50),
        Asset_Desc NVARCHAR(500),
        Asset_Status VARCHAR(20) CHECK (Asset_Status IN ('ACTIVE', 'INACTIVE', 'PLANNED', 'REMOVED')),
        Latitude DECIMAL(10,8),
        Longitude DECIMAL(11,8),
        Department VARCHAR(50),
        Notes NVARCHAR(MAX),
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    PRINT 'Created Tracks table';
END
ELSE
    PRINT 'Tracks table already exists';
GO

-- 5. Milepost_Geometry Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Milepost_Geometry')
BEGIN
    CREATE TABLE Milepost_Geometry (
        Milepost_ID INT PRIMARY KEY IDENTITY(1,1),
        Subdivision_ID INT FOREIGN KEY REFERENCES Subdivisions(Subdivision_ID),
        MP DECIMAL(10,4) NOT NULL, -- Milepost value
        Latitude DECIMAL(10,8) NOT NULL,
        Longitude DECIMAL(11,8) NOT NULL,
        Apple_Map_URL NVARCHAR(500),
        Google_Map_URL NVARCHAR(500),
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE(),
        UNIQUE(Subdivision_ID, MP)
    );
    PRINT 'Created Milepost_Geometry table';
END
ELSE
    PRINT 'Milepost_Geometry table already exists';
GO