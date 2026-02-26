-- Migration: Track Mileposts Reference Data
-- Description: Creates table to store milepost GPS reference coordinates for track subdivisions
-- Date: 2024
-- Author: System Generated
USE [HerzogAuthority]
GO

PRINT 'Running migration: 007_track_mileposts_schema.sql';
GO

-- Track_Mileposts: Reference table for milepost GPS coordinates
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Track_Mileposts]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Track_Mileposts] (
        [Milepost_ID] INT IDENTITY(1,1) PRIMARY KEY,
        [Subdivision_ID] INT NOT NULL,
        [Milepost] DECIMAL(10, 2) NOT NULL,
        [Latitude] DECIMAL(10, 7) NOT NULL,
        [Longitude] DECIMAL(11, 7) NOT NULL,
        [Apple_Map_URL] NVARCHAR(500) NULL,
        [Google_Map_URL] NVARCHAR(500) NULL,
        [Created_Date] DATETIME DEFAULT GETDATE(),
        [Updated_Date] DATETIME DEFAULT GETDATE(),
        
        CONSTRAINT [FK_Track_Mileposts_Subdivision] 
            FOREIGN KEY ([Subdivision_ID]) REFERENCES [dbo].[Subdivisions]([Subdivision_ID]) ON DELETE CASCADE,
        
        -- Unique constraint: one GPS coordinate per milepost per subdivision
        CONSTRAINT [UQ_Track_Mileposts_Subdivision_MP] 
            UNIQUE ([Subdivision_ID], [Milepost])
    );
    
    -- Index for fast milepost lookups
    CREATE NONCLUSTERED INDEX [IX_Track_Mileposts_Subdivision_MP] 
        ON [dbo].[Track_Mileposts]([Subdivision_ID], [Milepost]);
    
    -- Index for spatial queries (lat/long range searches)
    CREATE NONCLUSTERED INDEX [IX_Track_Mileposts_Coordinates] 
        ON [dbo].[Track_Mileposts]([Latitude], [Longitude]);
    
    PRINT '✅ Created Track_Mileposts table with indexes';
END
ELSE
    PRINT 'Track_Mileposts table already exists';
GO

PRINT '✅ Migration 007_track_mileposts_schema.sql completed successfully!';
GO
