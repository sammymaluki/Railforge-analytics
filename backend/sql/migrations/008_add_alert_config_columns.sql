-- Migration: Add Time_Minutes and Description columns to Alert_Configurations
-- Purpose: Store alert timing and descriptive information

USE HerzogAuthority;
GO

-- Add Time_Minutes column to Alert_Configurations
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Alert_Configurations' AND COLUMN_NAME = 'Time_Minutes'
)
BEGIN
    ALTER TABLE Alert_Configurations
    ADD Time_Minutes INT NULL;
    
    PRINT 'Added Time_Minutes column to Alert_Configurations table';
END
ELSE
    PRINT 'Time_Minutes column already exists in Alert_Configurations table';
GO

-- Add Description column to Alert_Configurations
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Alert_Configurations' AND COLUMN_NAME = 'Description'
)
BEGIN
    ALTER TABLE Alert_Configurations
    ADD Description NVARCHAR(500) NULL;
    
    PRINT 'Added Description column to Alert_Configurations table';
END
ELSE
    PRINT 'Description column already exists in Alert_Configurations table';
GO

-- Update Alert_Level values to be consistent (lowercase)
-- First, update the CHECK constraint by recreating it
IF OBJECT_ID('CK__Alert_Conf__Alert__Level', 'C') IS NOT NULL
BEGIN
    ALTER TABLE Alert_Configurations 
    DROP CONSTRAINT [CK__Alert_Configurations__Alert_Level];
END
GO

-- Add new constraint with lowercase values
ALTER TABLE Alert_Configurations 
ADD CONSTRAINT CK_Alert_Configurations_Alert_Level 
CHECK (Alert_Level IN ('informational', 'warning', 'critical', 'Informational', 'Warning', 'Critical'));
GO

PRINT 'Migration 008_add_alert_config_columns.sql completed successfully';
