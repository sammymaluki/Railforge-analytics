-- Extend Alert_Logs alert types to include GPS safety categories.
USE [HerzogAuthority]
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Alert_Logs')
BEGIN
    DECLARE @constraintName NVARCHAR(128);

    SELECT TOP 1 @constraintName = cc.name
    FROM sys.check_constraints cc
    INNER JOIN sys.columns c
        ON c.object_id = cc.parent_object_id
       AND c.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID('Alert_Logs')
      AND c.name = 'Alert_Type';

    IF @constraintName IS NOT NULL
    BEGIN
        DECLARE @dropSql NVARCHAR(400);
        SET @dropSql = N'ALTER TABLE Alert_Logs DROP CONSTRAINT ' + QUOTENAME(@constraintName);
        EXEC sp_executesql @dropSql;
        PRINT 'Dropped existing Alert_Logs.Alert_Type check constraint';
    END

    ALTER TABLE Alert_Logs
    ADD CONSTRAINT CK_Alert_Logs_Alert_Type
    CHECK (
        Alert_Type IN (
            'Boundary_Approach',
            'Boundary_Exit',
            'Boundary_Alert',
            'Proximity',
            'Proximity_Alert',
            'Overlap_Detected',
            'GPS_Accuracy',
            'GPS_Signal_Lost',
            'GPS_Stale',
            'Location_Unreliable'
        )
    );

    PRINT 'Created CK_Alert_Logs_Alert_Type with GPS safety values';
END
GO
