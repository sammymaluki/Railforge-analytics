USE [HerzogAuthority]
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'User_Sessions')
BEGIN
    CREATE TABLE User_Sessions (
        User_Session_ID BIGINT PRIMARY KEY IDENTITY(1,1),
        Session_ID NVARCHAR(64) NOT NULL UNIQUE,
        User_ID INT NOT NULL FOREIGN KEY REFERENCES Users(User_ID) ON DELETE NO ACTION,
        Agency_ID INT NULL FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE NO ACTION,
        Login_Time DATETIME NOT NULL DEFAULT GETDATE(),
        Last_Seen_Time DATETIME NOT NULL DEFAULT GETDATE(),
        Logout_Time DATETIME NULL,
        Session_Status VARCHAR(20) NOT NULL DEFAULT 'Active',
        IP_Address VARCHAR(50) NULL,
        Device_Info NVARCHAR(200) NULL,
        Token_Hash NVARCHAR(128) NULL,
        Created_Date DATETIME NOT NULL DEFAULT GETDATE(),
        Modified_Date DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created User_Sessions table';
END
ELSE
    PRINT 'User_Sessions table already exists';
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Audit_Retention_Policies')
BEGIN
    CREATE TABLE Audit_Retention_Policies (
        Policy_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT NOT NULL UNIQUE FOREIGN KEY REFERENCES Agencies(Agency_ID) ON DELETE CASCADE,
        Audit_Log_Retention_Days INT NOT NULL DEFAULT 365,
        Alert_Log_Retention_Days INT NOT NULL DEFAULT 180,
        GPS_Log_Retention_Days INT NOT NULL DEFAULT 90,
        Session_Log_Retention_Days INT NOT NULL DEFAULT 90,
        Is_Enabled BIT NOT NULL DEFAULT 1,
        Last_Run_Time DATETIME NULL,
        Created_Date DATETIME NOT NULL DEFAULT GETDATE(),
        Modified_Date DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Created Audit_Retention_Policies table';
END
ELSE
    PRINT 'Audit_Retention_Policies table already exists';
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_User_Sessions_User' AND object_id = OBJECT_ID('User_Sessions'))
BEGIN
    CREATE INDEX IX_User_Sessions_User ON User_Sessions(User_ID, Login_Time DESC);
    PRINT 'Created IX_User_Sessions_User index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_User_Sessions_Agency' AND object_id = OBJECT_ID('User_Sessions'))
BEGIN
    CREATE INDEX IX_User_Sessions_Agency ON User_Sessions(Agency_ID, Login_Time DESC);
    PRINT 'Created IX_User_Sessions_Agency index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Audit_Retention_Policies_Agency' AND object_id = OBJECT_ID('Audit_Retention_Policies'))
BEGIN
    CREATE INDEX IX_Audit_Retention_Policies_Agency ON Audit_Retention_Policies(Agency_ID);
    PRINT 'Created IX_Audit_Retention_Policies_Agency index';
END
GO
