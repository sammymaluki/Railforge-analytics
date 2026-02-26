-- Logging, Tracking, and Sync Tables
USE [HerzogAuthority]
GO

-- 13. GPS_Logs Table (Real-time Tracking)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GPS_Logs')
BEGIN
    CREATE TABLE GPS_Logs (
        Log_ID BIGINT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Authority_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE NO ACTION,
        Latitude DECIMAL(10,8) NOT NULL,
        Longitude DECIMAL(11,8) NOT NULL,
        Speed DECIMAL(5,2),
        Heading DECIMAL(5,2),
        Accuracy DECIMAL(5,2),
        Is_Offline BIT DEFAULT 0,
        Sync_Status VARCHAR(20) DEFAULT 'Pending',
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created GPS_Logs table';
END
ELSE
    PRINT 'GPS_Logs table already exists';
GO

-- 14. Alert_Logs Table (Audit Trail)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Alert_Logs')
BEGIN
    CREATE TABLE Alert_Logs (
        Alert_Log_ID BIGINT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Authority_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE NO ACTION,
        Alert_Type VARCHAR(50) CHECK (Alert_Type IN ('Boundary_Approach', 'Boundary_Exit', 'Proximity', 'Overlap_Detected')),
        Alert_Level VARCHAR(20),
        Triggered_Distance DECIMAL(5,2),
        Message NVARCHAR(500),
        Is_Delivered BIT DEFAULT 0,
        Delivered_Time DATETIME,
        Is_Read BIT DEFAULT 0,
        Read_Time DATETIME,
        Created_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Alert_Logs table';
END
ELSE
    PRINT 'Alert_Logs table already exists';
GO

-- 15. System_Audit_Logs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'System_Audit_Logs')
BEGIN
    CREATE TABLE System_Audit_Logs (
        Audit_ID BIGINT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Action_Type VARCHAR(50) NOT NULL,
        Table_Name NVARCHAR(100),
        Record_ID INT,
        Old_Value NVARCHAR(MAX),
        New_Value NVARCHAR(MAX),
        IP_Address VARCHAR(50),
        Device_Info NVARCHAR(200),
        Created_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created System_Audit_Logs table';
END
ELSE
    PRINT 'System_Audit_Logs table already exists';
GO

-- 16. Offline_Downloads Table (Track what users downloaded)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Offline_Downloads')
BEGIN
    CREATE TABLE Offline_Downloads (
        Download_ID INT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE NO ACTION,
        Subdivision_ID INT FOREIGN KEY REFERENCES Subdivisions(Subdivision_ID) ON DELETE NO ACTION,
        Download_Date DATETIME DEFAULT GETDATE(),
        Data_Size_MB DECIMAL(10,2),
        Is_Complete BIT DEFAULT 1,
        Created_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Offline_Downloads table';
END
ELSE
    PRINT 'Offline_Downloads table already exists';
GO

-- 17. Mobile_Devices Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Mobile_Devices')
BEGIN
    CREATE TABLE Mobile_Devices (
        Device_ID INT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Device_UUID VARCHAR(100) UNIQUE NOT NULL,
        Platform VARCHAR(10) CHECK (Platform IN ('iOS', 'Android')),
        OS_Version VARCHAR(20),
        App_Version VARCHAR(20),
        Last_Sync_Time DATETIME,
        Push_Token NVARCHAR(500),
        Is_Active BIT DEFAULT 1,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Mobile_Devices table';
END
ELSE
    PRINT 'Mobile_Devices table already exists';
GO

-- 18. Data_Sync_Queue Table (For offline sync)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Data_Sync_Queue')
BEGIN
    CREATE TABLE Data_Sync_Queue (
        Sync_ID BIGINT PRIMARY KEY IDENTITY(1,1),
        Device_ID INT FOREIGN KEY REFERENCES Mobile_Devices(Device_ID) ON DELETE NO ACTION,
        Table_Name NVARCHAR(100) NOT NULL,
        Record_ID INT NOT NULL,
        Operation VARCHAR(10) CHECK (Operation IN ('INSERT', 'UPDATE', 'DELETE')),
        Sync_Data NVARCHAR(MAX) NOT NULL,
        Sync_Status VARCHAR(20) DEFAULT 'Pending',
        Attempts INT DEFAULT 0,
        Last_Attempt DATETIME,
        Error_Message NVARCHAR(MAX),
        Created_Date DATETIME DEFAULT GETDATE()
    );
    
    PRINT 'Created Data_Sync_Queue table';
END
ELSE
    PRINT 'Data_Sync_Queue table already exists';
GO

-- Performance Indexes for logging tables
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GPS_Logs_Recent' AND object_id = OBJECT_ID('GPS_Logs'))
BEGIN
    CREATE INDEX IX_GPS_Logs_Recent ON GPS_Logs(User_ID, Authority_ID, Created_Date DESC);
    PRINT 'Created IX_GPS_Logs_Recent index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GPS_Logs_Sync' AND object_id = OBJECT_ID('GPS_Logs'))
BEGIN
    CREATE INDEX IX_GPS_Logs_Sync ON GPS_Logs(Sync_Status, Is_Offline, Created_Date);
    PRINT 'Created IX_GPS_Logs_Sync index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Alert_Logs_User' AND object_id = OBJECT_ID('Alert_Logs'))
BEGIN
    CREATE INDEX IX_Alert_Logs_User ON Alert_Logs(User_ID, Created_Date DESC);
    PRINT 'Created IX_Alert_Logs_User index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_System_Audit_Logs' AND object_id = OBJECT_ID('System_Audit_Logs'))
BEGIN
    CREATE INDEX IX_System_Audit_Logs ON System_Audit_Logs(User_ID, Created_Date DESC, Action_Type);
    PRINT 'Created IX_System_Audit_Logs index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Data_Sync_Queue_Status' AND object_id = OBJECT_ID('Data_Sync_Queue'))
BEGIN
    CREATE INDEX IX_Data_Sync_Queue_Status ON Data_Sync_Queue(Sync_Status, Created_Date);
    PRINT 'Created IX_Data_Sync_Queue_Status index';
END
GO

-- Create a view for active authority status
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_ActiveAuthorities')
    DROP VIEW vw_ActiveAuthorities;
GO

CREATE VIEW vw_ActiveAuthorities
AS
SELECT 
    a.Authority_ID,
    a.User_ID,
    u.Employee_Name,
    u.Employee_Contact,
    a.Employee_Name_Display,
    a.Employee_Contact_Display,
    a.Authority_Type,
    s.Subdivision_Code,
    s.Subdivision_Name,
    a.Begin_MP,
    a.End_MP,
    a.Track_Type,
    a.Track_Number,
    a.Start_Time,
    a.Expiration_Time,
    a.Is_Active,
    ag.Agency_CD,
    ag.Agency_Name,
    DATEDIFF(MINUTE, a.Start_Time, GETDATE()) AS Minutes_Active,
    CASE 
        WHEN a.Expiration_Time IS NOT NULL AND GETDATE() > a.Expiration_Time THEN 'Expired'
        WHEN a.End_Tracking_Confirmed = 1 THEN 'Completed'
        ELSE 'Active'
    END AS Status
FROM Authorities a
INNER JOIN Users u ON a.User_ID = u.User_ID
INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
INNER JOIN Agencies ag ON s.Agency_ID = ag.Agency_ID
WHERE a.Is_Active = 1;
GO

PRINT 'Created vw_ActiveAuthorities view';
GO