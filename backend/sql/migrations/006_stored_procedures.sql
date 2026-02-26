-- Stored Procedures for Critical Operations
USE [HerzogAuthority]
GO

-- Procedure to create authority with overlap check
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_CreateAuthority')
    DROP PROCEDURE sp_CreateAuthority;
GO

CREATE PROCEDURE sp_CreateAuthority
    @UserID INT,
    @AuthorityType VARCHAR(20),
    @SubdivisionID INT,
    @BeginMP DECIMAL(10,4),
    @EndMP DECIMAL(10,4),
    @TrackType VARCHAR(20),
    @TrackNumber VARCHAR(20),
    @EmployeeNameDisplay NVARCHAR(100) = NULL,
    @EmployeeContactDisplay VARCHAR(20) = NULL,
    @ExpirationTime DATETIME = NULL,
    @AuthorityID INT OUTPUT,
    @HasOverlap BIT OUTPUT,
    @OverlapDetails NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @OverlapCount INT;
    DECLARE @OverlapJSON NVARCHAR(MAX);
    
    BEGIN TRANSACTION;
    
    BEGIN TRY
        -- Check for overlaps using the function
        SELECT @OverlapCount = COUNT(*)
        FROM fn_CheckAuthorityOverlap(@SubdivisionID, @TrackType, @TrackNumber, @BeginMP, @EndMP, NULL)
        WHERE Has_Overlap = 1;
        
        -- Get overlap details for alert
        SELECT @OverlapJSON = (
            SELECT 
                Authority_ID,
                Employee_Name_Display,
                Employee_Contact_Display,
                Begin_MP,
                End_MP,
                Overlap_Type
            FROM fn_CheckAuthorityOverlap(@SubdivisionID, @TrackType, @TrackNumber, @BeginMP, @EndMP, NULL)
            WHERE Has_Overlap = 1
            FOR JSON PATH
        );
        
        SET @HasOverlap = CASE WHEN @OverlapCount > 0 THEN 1 ELSE 0 END;
        SET @OverlapDetails = @OverlapJSON;
        
        -- Insert the authority
        INSERT INTO Authorities (
            User_ID, 
            Authority_Type, 
            Subdivision_ID, 
            Begin_MP, 
            End_MP, 
            Track_Type, 
            Track_Number,
            Employee_Name_Display,
            Employee_Contact_Display,
            Expiration_Time,
            Is_Active
        )
        VALUES (
            @UserID,
            @AuthorityType,
            @SubdivisionID,
            @BeginMP,
            @EndMP,
            @TrackType,
            @TrackNumber,
            ISNULL(@EmployeeNameDisplay, (SELECT Employee_Name FROM Users WHERE User_ID = @UserID)),
            ISNULL(@EmployeeContactDisplay, (SELECT Employee_Contact FROM Users WHERE User_ID = @UserID)),
            @ExpirationTime,
            1
        );
        
        SET @AuthorityID = SCOPE_IDENTITY();
        
        -- Log overlaps if any
        IF @OverlapCount > 0
        BEGIN
            INSERT INTO Authority_Overlaps (Authority1_ID, Authority2_ID, Overlap_Begin_MP, Overlap_End_MP)
            SELECT 
                @AuthorityID,
                o.Authority_ID,
                CASE WHEN @BeginMP > o.Begin_MP THEN @BeginMP ELSE o.Begin_MP END,
                CASE WHEN @EndMP < o.End_MP THEN @EndMP ELSE o.End_MP END
            FROM fn_CheckAuthorityOverlap(@SubdivisionID, @TrackType, @TrackNumber, @BeginMP, @EndMP, NULL) o
            WHERE o.Has_Overlap = 1;
        END;
        
        -- Create trip record
        INSERT INTO Trips (Authority_ID, User_ID, Start_Time)
        VALUES (@AuthorityID, @UserID, GETDATE());
        
        COMMIT TRANSACTION;
        
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

PRINT 'Created sp_CreateAuthority procedure';
GO

-- Procedure to check proximity between users
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_CheckProximity')
    DROP PROCEDURE sp_CheckProximity;
GO

CREATE PROCEDURE sp_CheckProximity
    @AuthorityID INT,
    @CurrentLatitude DECIMAL(10,8),
    @CurrentLongitude DECIMAL(11,8),
    @MaxDistanceMiles DECIMAL(5,2) = 1.0
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @UserID INT;
    DECLARE @SubdivisionID INT;
    DECLARE @TrackType VARCHAR(20);
    DECLARE @TrackNumber VARCHAR(20);
    DECLARE @BeginMP DECIMAL(10,4);
    DECLARE @EndMP DECIMAL(10,4);
    
    -- Get authority details
    SELECT 
        @UserID = User_ID,
        @SubdivisionID = Subdivision_ID,
        @TrackType = Track_Type,
        @TrackNumber = Track_Number,
        @BeginMP = Begin_MP,
        @EndMP = End_MP
    FROM Authorities 
    WHERE Authority_ID = @AuthorityID AND Is_Active = 1;
    
    IF @UserID IS NULL
    BEGIN
        SELECT NULL AS ProximityData;
        RETURN;
    END;
    
    -- Find overlapping authorities
    WITH OverlappingAuthorities AS (
        SELECT 
            o.Authority_ID,
            o.User_ID,
            o.Employee_Name_Display,
            o.Employee_Contact_Display,
            u.Employee_Name,
            u.Employee_Contact
        FROM fn_CheckAuthorityOverlap(@SubdivisionID, @TrackType, @TrackNumber, @BeginMP, @EndMP, @AuthorityID) o
        INNER JOIN Users u ON o.User_ID = u.User_ID
        WHERE o.Has_Overlap = 1
    )
    SELECT 
        oa.*,
        gl.Latitude,
        gl.Longitude,
        -- Calculate straight-line distance (simplified - will be replaced with track distance)
        (3959 * ACOS(
            COS(RADIANS(@CurrentLatitude)) * 
            COS(RADIANS(gl.Latitude)) * 
            COS(RADIANS(gl.Longitude) - RADIANS(@CurrentLongitude)) + 
            SIN(RADIANS(@CurrentLatitude)) * 
            SIN(RADIANS(gl.Latitude))
        )) AS DistanceMiles,
        gl.Created_Date AS LastPositionTime
    FROM OverlappingAuthorities oa
    CROSS APPLY (
        SELECT TOP 1 
            Latitude, 
            Longitude, 
            Created_Date
        FROM GPS_Logs 
        WHERE User_ID = oa.User_ID 
        ORDER BY Created_Date DESC
    ) gl
    WHERE gl.Latitude IS NOT NULL 
        AND gl.Longitude IS NOT NULL
        AND (3959 * ACOS(
            COS(RADIANS(@CurrentLatitude)) * 
            COS(RADIANS(gl.Latitude)) * 
            COS(RADIANS(gl.Longitude) - RADIANS(@CurrentLongitude)) + 
            SIN(RADIANS(@CurrentLatitude)) * 
            SIN(RADIANS(gl.Latitude))
        )) <= @MaxDistanceMiles
    ORDER BY DistanceMiles;
    
END;
GO

PRINT 'Created sp_CheckProximity procedure';
GO

-- Procedure to calculate track distance (not straight-line GPS distance)
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_CalculateTrackDistance')
    DROP PROCEDURE sp_CalculateTrackDistance;
GO

CREATE PROCEDURE sp_CalculateTrackDistance
    @SubdivisionID INT,
    @StartMP DECIMAL(10,4),
    @EndMP DECIMAL(10,4),
    @TrackDistanceMiles DECIMAL(10,4) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- For now, return absolute difference (simplified)
    -- In production, this should use actual track geometry and milepost data
    SET @TrackDistanceMiles = ABS(@EndMP - @StartMP);
    
    -- Note: In the real implementation, this would:
    -- 1. Query the milepost geometry table
    -- 2. Calculate distance along the track using GIS functions
    -- 3. Account for track curvature, elevation changes, etc.
    
    RETURN;
END;
GO

PRINT 'Created sp_CalculateTrackDistance procedure';
GO