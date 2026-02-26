-- Initial database schema based on provided requirements
USE [HerzogAuthority]
GO

-- 1. Agencies Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Agencies')
BEGIN
    CREATE TABLE Agencies (
        Agency_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_CD VARCHAR(10) UNIQUE NOT NULL,
        Agency_Name NVARCHAR(100) NOT NULL,
        Region NVARCHAR(50),
        Contact_Email NVARCHAR(100),
        Contact_Phone VARCHAR(20),
        Is_Active BIT DEFAULT 1,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    PRINT 'Created Agencies table';
END
ELSE
    PRINT 'Agencies table already exists';
GO

-- Seed a default agency so initial users can reference it
IF NOT EXISTS (SELECT 1 FROM Agencies WHERE Agency_ID = 1)
BEGIN
    INSERT INTO Agencies (Agency_CD, Agency_Name, Contact_Email, Contact_Phone)
    VALUES ('DEFAULT', 'Default Agency', 'admin@herzog.com', '555-123-4567');
    PRINT 'Inserted default agency';
END
ELSE
    PRINT 'Default agency already exists';
GO

-- 2. Subdivisions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Subdivisions')
BEGIN
    CREATE TABLE Subdivisions (
        Subdivision_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID),
        Subdivision_Code VARCHAR(20) NOT NULL,
        Subdivision_Name NVARCHAR(100) NOT NULL,
        Region NVARCHAR(50),
        Is_Active BIT DEFAULT 1,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE(),
        UNIQUE(Agency_ID, Subdivision_Code)
    );
    PRINT 'Created Subdivisions table';
END
ELSE
    PRINT 'Subdivisions table already exists';
GO

-- 3. Users Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        User_ID INT PRIMARY KEY IDENTITY(1,1),
        Agency_ID INT FOREIGN KEY REFERENCES Agencies(Agency_ID),
        Username NVARCHAR(50) UNIQUE NOT NULL,
        Password_Hash NVARCHAR(255) NOT NULL,
        Employee_Name NVARCHAR(100) NOT NULL,
        Employee_Contact VARCHAR(20),
        Email NVARCHAR(100),
        Role VARCHAR(30) CHECK (Role IN ('Administrator', 'Supervisor', 'Field_Worker', 'Viewer')),
        Is_Active BIT DEFAULT 1,
        Last_Login DATETIME,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE()
    );
    PRINT 'Created Users table';
END
ELSE
    PRINT 'Users table already exists';
GO

-- Create initial admin user (password: admin123)
INSERT INTO Users (Agency_ID, Username, Password_Hash, Employee_Name, Employee_Contact, Email, Role)
SELECT 
    1, 
    'admin', 
    -- Hash for 'admin123'
    '$2a$10$DIy/kU1pMvxUet9MXcpoa.qonXJPLs.tx4Qf8Af3LzaW3DYQTHwVS', 
    'System Administrator', 
    '555-123-4567', 
    'admin@herzog.com', 
    'Administrator'
WHERE NOT EXISTS (SELECT 1 FROM Users WHERE Username = 'admin');
GO