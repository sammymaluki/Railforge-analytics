USE [HerzogAuthority]
GO

-- Pin_Types photo policy columns
IF COL_LENGTH('Pin_Types', 'Photos_Enabled') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photos_Enabled BIT NOT NULL CONSTRAINT DF_PinTypes_PhotosEnabled DEFAULT 1;
    PRINT 'Added Pin_Types.Photos_Enabled';
END
GO

IF COL_LENGTH('Pin_Types', 'Photo_Required') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photo_Required BIT NOT NULL CONSTRAINT DF_PinTypes_PhotoRequired DEFAULT 0;
    PRINT 'Added Pin_Types.Photo_Required';
END
GO

IF COL_LENGTH('Pin_Types', 'Max_Photos') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Max_Photos INT NOT NULL CONSTRAINT DF_PinTypes_MaxPhotos DEFAULT 1;
    PRINT 'Added Pin_Types.Max_Photos';
END
GO

IF COL_LENGTH('Pin_Types', 'Max_Photo_Size_MB') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Max_Photo_Size_MB INT NOT NULL CONSTRAINT DF_PinTypes_MaxPhotoSize DEFAULT 10;
    PRINT 'Added Pin_Types.Max_Photo_Size_MB';
END
GO

IF COL_LENGTH('Pin_Types', 'Photo_Compression_Quality') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photo_Compression_Quality INT NOT NULL CONSTRAINT DF_PinTypes_PhotoCompression DEFAULT 80;
    PRINT 'Added Pin_Types.Photo_Compression_Quality';
END
GO

IF COL_LENGTH('Pin_Types', 'Photo_Retention_Days') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photo_Retention_Days INT NULL;
    PRINT 'Added Pin_Types.Photo_Retention_Days';
END
GO

IF COL_LENGTH('Pin_Types', 'Photo_Access_Roles') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photo_Access_Roles NVARCHAR(200) NOT NULL CONSTRAINT DF_PinTypes_PhotoAccessRoles DEFAULT 'Administrator,Supervisor,Field_Worker';
    PRINT 'Added Pin_Types.Photo_Access_Roles';
END
GO

IF COL_LENGTH('Pin_Types', 'Photo_Export_Mode') IS NULL
BEGIN
    ALTER TABLE Pin_Types ADD Photo_Export_Mode NVARCHAR(20) NOT NULL CONSTRAINT DF_PinTypes_PhotoExportMode DEFAULT 'links';
    PRINT 'Added Pin_Types.Photo_Export_Mode';
END
GO

-- Pins multi-photo columns
IF COL_LENGTH('Pins', 'Photo_URLs') IS NULL
BEGIN
    ALTER TABLE Pins ADD Photo_URLs NVARCHAR(MAX) NULL;
    PRINT 'Added Pins.Photo_URLs';
END
GO

IF COL_LENGTH('Pins', 'Photo_Metadata') IS NULL
BEGIN
    ALTER TABLE Pins ADD Photo_Metadata NVARCHAR(MAX) NULL;
    PRINT 'Added Pins.Photo_Metadata';
END
GO
