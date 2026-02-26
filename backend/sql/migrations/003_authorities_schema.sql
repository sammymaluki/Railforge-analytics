-- Authorities and Authority Overlap Tables
USE [HerzogAuthority]
GO

-- 6. Authorities Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Authorities')
BEGIN
    CREATE TABLE Authorities (
        Authority_ID INT PRIMARY KEY IDENTITY(1,1),
        User_ID INT FOREIGN KEY REFERENCES Users(User_ID) ON DELETE CASCADE,
        Authority_Type VARCHAR(20) CHECK (Authority_Type IN ('Track_Authority', 'Lone_Worker_Authority')) NOT NULL,
        Subdivision_ID INT FOREIGN KEY REFERENCES Subdivisions(Subdivision_ID) ON DELETE CASCADE,
        Begin_MP DECIMAL(10,4) NOT NULL,
        End_MP DECIMAL(10,4) NOT NULL,
        Track_Type VARCHAR(20) NOT NULL,
        Track_Number VARCHAR(20) NOT NULL,
        Start_Time DATETIME DEFAULT GETDATE(),
        Expiration_Time DATETIME,
        Is_Active BIT DEFAULT 1,
        End_Tracking_Time DATETIME,
        End_Tracking_Confirmed BIT DEFAULT 0,
        Created_Date DATETIME DEFAULT GETDATE(),
        Modified_Date DATETIME DEFAULT GETDATE(),
        
        -- For display in overlap alerts
        Employee_Name_Display NVARCHAR(100),
        Employee_Contact_Display VARCHAR(20),
        
        -- Constraints
        CONSTRAINT CHK_Begin_End_MP CHECK (Begin_MP <= End_MP),
        CONSTRAINT CHK_Expiration_Time CHECK (Expiration_Time IS NULL OR Expiration_Time > Start_Time)
    );
    
    PRINT 'Created Authorities table';
END
ELSE
    PRINT 'Authorities table already exists';
GO

-- 7. Authority_Overlaps Table (Logging)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Authority_Overlaps')
BEGIN
    CREATE TABLE Authority_Overlaps (
        Overlap_ID INT PRIMARY KEY IDENTITY(1,1),
        Authority1_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE NO ACTION,
        Authority2_ID INT FOREIGN KEY REFERENCES Authorities(Authority_ID) ON DELETE NO ACTION,
        Overlap_Detected_Time DATETIME DEFAULT GETDATE(),
        Alert_Sent_Time DATETIME,
        Is_Resolved BIT DEFAULT 0,
        Resolved_Time DATETIME,
        
        -- Additional details for reporting
        Overlap_Begin_MP DECIMAL(10,4),
        Overlap_End_MP DECIMAL(10,4),
        Notes NVARCHAR(500)
    );
    
    PRINT 'Created Authority_Overlaps table';
END
ELSE
    PRINT 'Authority_Overlaps table already exists';
GO

-- Index for faster authority lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Authorities_Active' AND object_id = OBJECT_ID('Authorities'))
BEGIN
    CREATE INDEX IX_Authorities_Active 
    ON Authorities(Is_Active, Subdivision_ID, Track_Type, Track_Number, Begin_MP, End_MP);
    PRINT 'Created IX_Authorities_Active index';
END
GO

-- Index for checking overlaps efficiently
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Authorities_Overlap_Check' AND object_id = OBJECT_ID('Authorities'))
BEGIN
    CREATE INDEX IX_Authorities_Overlap_Check 
    ON Authorities(Subdivision_ID, Track_Type, Track_Number, Is_Active)
    INCLUDE (Begin_MP, End_MP, User_ID);
    PRINT 'Created IX_Authorities_Overlap_Check index';
END
GO

-- Function to check for authority overlaps (will be used in triggers/stored procedures)
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'FN' AND name = 'fn_CheckAuthorityOverlap')
    DROP FUNCTION fn_CheckAuthorityOverlap;
GO

CREATE FUNCTION fn_CheckAuthorityOverlap (
    @SubdivisionID INT,
    @TrackType VARCHAR(20),
    @TrackNumber VARCHAR(20),
    @BeginMP DECIMAL(10,4),
    @EndMP DECIMAL(10,4),
    @ExcludeAuthorityID INT = NULL
)
RETURNS TABLE
AS
RETURN (
    SELECT 
        a.Authority_ID,
        a.User_ID,
        a.Employee_Name_Display,
        a.Employee_Contact_Display,
        u.Employee_Name,
        u.Employee_Contact,
        a.Begin_MP,
        a.End_MP,
        CASE 
            WHEN @BeginMP <= a.End_MP AND @EndMP >= a.Begin_MP THEN 1
            ELSE 0
        END AS Has_Overlap,
        CASE 
            WHEN @BeginMP < a.Begin_MP AND @EndMP > a.End_MP THEN 'Completely Overlaps'
            WHEN @BeginMP >= a.Begin_MP AND @EndMP <= a.End_MP THEN 'Completely Within'
            WHEN @BeginMP < a.Begin_MP AND @EndMP <= a.End_MP THEN 'Overlaps Start'
            WHEN @BeginMP >= a.Begin_MP AND @EndMP > a.End_MP THEN 'Overlaps End'
            ELSE 'No Overlap'
        END AS Overlap_Type
    FROM Authorities a
    INNER JOIN Users u ON a.User_ID = u.User_ID
    WHERE a.Subdivision_ID = @SubdivisionID
        AND a.Track_Type = @TrackType
        AND a.Track_Number = @TrackNumber
        AND a.Is_Active = 1
        AND a.Authority_ID != ISNULL(@ExcludeAuthorityID, -1)
        AND @BeginMP <= a.End_MP 
        AND @EndMP >= a.Begin_MP
);
GO

PRINT 'Created fn_CheckAuthorityOverlap function';
GO