-- Pins, Trips, and Configuration Tables
USE [HerzogAuthority]
GO

-- 8. Pin_Types Table (Configurable)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Pin_Types')
BEGIN
    CREATE TABLE Pin_Types (
        Pin_Type_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE CASCADE,
        Pin_Category NVARCHAR(50) NOT NULL,
        Pin_Subtype NVARCHAR(100) NOT NULL,
        Icon_URL NVARCHAR(500),
        Color VARCHAR(10),
        Is_Active BIT DEFAULT 1,
        Sort_Order INT DEFAULT 0,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE(),
        UNIQUE(Agency_ID, Pin_Subtype)
    );
    
    PRINT 'Created Pin_Types table';
END
ELSE
    PRINT 'Pin_Types table already exists';
GO

-- 9. Pins Table (Pin Drops)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Pins')
BEGIN
    CREATE TABLE Pins (
        Pin_ID INT PRIMARY KEY IDENTITY(1,1),
        Authority_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE CASCADE,
        Pin_Type_ID INT FOREIGN KEY REFERENCES Pin_Types(Pin_Type_ID) ON DELETE CASCADE,
        Latitude DECIMAL(10,8) NOT NULL,
        Longitude DECIMAL(11,8) NOT NULL,
        Track_Type VARCHAR(20),
        Track_Number VARCHAR(20),
        MP DECIMAL(10,4),
        Notes NVARCHAR(MAX),
        Photo_URL NVARCHAR(500),
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Pins table';
END
ELSE
    PRINT 'Pins table already exists';
GO

-- 10. Trips Table (Trip Reports)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Trips')
BEGIN
    CREATE TABLE Trips (
        Trip_ID INT PRIMARY KEY IDENTITY(1,1),
        Authority_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE CASCADE,
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Start_Time DATETIME NOT NULL,
        End_Time DATETIME,
        Trip_Notes NVARCHAR(MAX),
        Report_Generated BIT DEFAULT 0,
        Report_Generated_Time DATETIME,
        Report_Sent_To_Email NVARCHAR(100),
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Trips table';
END
ELSE
    PRINT 'Trips table already exists';
GO

-- 11. Alert_Configurations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Alert_Configurations')
BEGIN
    CREATE TABLE Alert_Configurations (
        Config_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE CASCADE,
        Config_Type VARCHAR(50) CHECK (Config_Type IN ('Boundary_Alert', 'Proximity_Alert', 'Overlap_Alert')),
        Alert_Level VARCHAR(20) CHECK (Alert_Level IN ('Informational', 'Warning', 'Critical')),
        Distance_Miles DECIMAL(5,2) NOT NULL,
        Message_Template NVARCHAR(500),
        Sound_File NVARCHAR(200),
        Vibration_Pattern VARCHAR(50),
        Is_Active BIT DEFAULT 1,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE(),
        UNIQUE(Agency_ID, Config_Type, Alert_Level)
    );
    
    PRINT 'Created Alert_Configurations table';
END
ELSE
    PRINT 'Alert_Configurations table already exists';
GO

-- 12. Branding_Configurations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Branding_Configurations')
BEGIN
    CREATE TABLE Branding_Configurations (
        Branding_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE CASCADE,
        App_Name NVARCHAR(100) DEFAULT 'Sidekick',
        Primary_Color VARCHAR(10) DEFAULT '#000000',
        Secondary_Color VARCHAR(10) DEFAULT '#FFFFFF',
        Accent_Color VARCHAR(10) DEFAULT '#FFD100',
        Logo_URL NVARCHAR(500),
        Splash_Screen_URL NVARCHAR(500),
        App_Icon_URL NVARCHAR(500),
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Branding_Configurations table';
END
ELSE
    PRINT 'Branding_Configurations table already exists';
GO

-- Indexes for performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Pins_Authority' AND object_id = OBJECT_ID('Pins'))
BEGIN
    CREATE INDEX IX_Pins_Authority ON Pins(Authority_ID);
    PRINT 'Created IX_Pins_Authority index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Trips_User' AND object_id = OBJECT_ID('Trips'))
BEGIN
    CREATE INDEX IX_Trips_User ON Trips(User_ID, Start_Time DESC);
    PRINT 'Created IX_Trips_User index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Alert_Configs_Agency' AND object_id = OBJECT_ID('Alert_Configurations'))
BEGIN
    CREATE INDEX IX_Alert_Configs_Agency ON Alert_Configurations(Agency_ID, Config_Type, Is_Active);
    PRINT 'Created IX_Alert_Configs_Agency index';
END
GO