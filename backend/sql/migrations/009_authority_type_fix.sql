USE [HerzogAuthority]
GO

/*
  Fix Authority_Type contract mismatch:
  - Existing schema/proc commonly use VARCHAR(20), but canonical value
    "Lone_Worker_Authority" is 21 chars.
  - This migration widens the column/procedure and standardizes the check.
*/

-- 1) Widen Authority_Type column to support canonical values.
IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Authorities')
    AND name = 'Authority_Type'
    AND max_length < 32
)
BEGIN
  ALTER TABLE dbo.Authorities
    ALTER COLUMN Authority_Type VARCHAR(32) NOT NULL;
  PRINT 'Altered Authorities.Authority_Type to VARCHAR(32)';
END
GO

-- 2) Drop existing Authority_Type CHECK constraint(s) on Authorities.
DECLARE @dropSql NVARCHAR(MAX) = N'';
SELECT @dropSql = @dropSql + N'ALTER TABLE dbo.Authorities DROP CONSTRAINT [' + cc.name + N'];' + CHAR(10)
FROM sys.check_constraints cc
INNER JOIN sys.columns c
  ON cc.parent_object_id = c.object_id
 AND cc.parent_column_id = c.column_id
WHERE cc.parent_object_id = OBJECT_ID('dbo.Authorities')
  AND c.name = 'Authority_Type';

IF LEN(@dropSql) > 0
BEGIN
  EXEC sp_executesql @dropSql;
  PRINT 'Dropped existing Authority_Type check constraint(s)';
END
GO

-- 3) Recreate standardized check constraint with canonical values.
IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CHK_Authorities_Authority_Type'
    AND parent_object_id = OBJECT_ID('dbo.Authorities')
)
BEGIN
  ALTER TABLE dbo.Authorities WITH CHECK ADD CONSTRAINT CHK_Authorities_Authority_Type
  CHECK (Authority_Type IN ('Track_Authority', 'Lone_Worker_Authority'));
  PRINT 'Created CHK_Authorities_Authority_Type';
END
GO

-- 4) Recreate sp_CreateAuthority with widened @AuthorityType parameter.
CREATE OR ALTER PROCEDURE sp_CreateAuthority
    @UserID INT,
    @AuthorityType VARCHAR(32),
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
        SELECT @OverlapCount = COUNT(*)
        FROM fn_CheckAuthorityOverlap(@SubdivisionID, @TrackType, @TrackNumber, @BeginMP, @EndMP, NULL)
        WHERE Has_Overlap = 1;

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

        INSERT INTO Trips (Authority_ID, User_ID, Start_Time)
        VALUES (@AuthorityID, @UserID, GETDATE());

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

PRINT 'Applied authority type fixes';
GO

