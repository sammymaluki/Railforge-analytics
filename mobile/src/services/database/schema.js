export const SCHEMA = {
  CREATE_TABLES: [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      employee_contact TEXT,
      email TEXT,
      role TEXT NOT NULL,
      agency_id INTEGER NOT NULL,
      agency_code TEXT,
      agency_name TEXT,
      token TEXT,
      is_active BOOLEAN DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`,

    // Agencies table
    `CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      agency_code TEXT NOT NULL,
      agency_name TEXT NOT NULL,
      region TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agency_id)
    )`,

    // Subdivisions table
    `CREATE TABLE IF NOT EXISTS subdivisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subdivision_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      subdivision_code TEXT NOT NULL,
      subdivision_name TEXT NOT NULL,
      region TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subdivision_id)
    )`,

    // Tracks table
    `CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER,
      subdivision_id INTEGER NOT NULL,
      ls TEXT,
      track_type TEXT NOT NULL,
      track_number TEXT,
      diverging_track_type TEXT,
      diverging_track_number TEXT,
      bmp REAL,
      emp REAL,
      asset_name TEXT,
      asset_type TEXT,
      asset_subtype TEXT,
      asset_id TEXT,
      asset_status TEXT,
      latitude REAL,
      longitude REAL,
      department TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id)
    )`,

    // Milepost geometry table
    `CREATE TABLE IF NOT EXISTS milepost_geometry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milepost_id INTEGER,
      subdivision_id INTEGER NOT NULL,
      mp REAL NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      apple_map_url TEXT,
      google_map_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subdivision_id, mp),
      FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id)
    )`,

    // Authorities table
    `CREATE TABLE IF NOT EXISTS authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authority_id INTEGER,
      user_id INTEGER NOT NULL,
      authority_type TEXT NOT NULL,
      subdivision_id INTEGER NOT NULL,
      begin_mp REAL NOT NULL,
      end_mp REAL NOT NULL,
      track_type TEXT NOT NULL,
      track_number TEXT NOT NULL,
      start_time DATETIME,
      expiration_time DATETIME,
      is_active BOOLEAN DEFAULT 1,
      end_tracking_time DATETIME,
      end_tracking_confirmed BOOLEAN DEFAULT 0,
      employee_name_display TEXT,
      employee_contact_display TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (user_id),
      FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id)
    )`,

    // Pins table
    `CREATE TABLE IF NOT EXISTS pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin_id INTEGER,
      authority_id INTEGER NOT NULL,
      pin_type_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      track_type TEXT,
      track_number TEXT,
      mp REAL,
      notes TEXT,
      photo_url TEXT,
      photo_local_path TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (authority_id) REFERENCES authorities (authority_id)
    )`,

    // Pin types table
    `CREATE TABLE IF NOT EXISTS pin_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin_type_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      pin_category TEXT NOT NULL,
      pin_subtype TEXT NOT NULL,
      icon_url TEXT,
      color TEXT,
      is_active BOOLEAN DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pin_type_id)
    )`,

    // GPS logs table
    `CREATE TABLE IF NOT EXISTS gps_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id INTEGER,
      user_id INTEGER NOT NULL,
      authority_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      speed REAL,
      heading REAL,
      accuracy REAL,
      is_offline BOOLEAN DEFAULT 0,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (user_id),
      FOREIGN KEY (authority_id) REFERENCES authorities (authority_id)
    )`,

    // Alert logs table
    `CREATE TABLE IF NOT EXISTS alert_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_log_id INTEGER,
      user_id INTEGER NOT NULL,
      authority_id INTEGER,
      alert_type TEXT NOT NULL,
      alert_level TEXT,
      triggered_distance REAL,
      message TEXT NOT NULL,
      is_delivered BOOLEAN DEFAULT 0,
      delivered_time DATETIME,
      is_read BOOLEAN DEFAULT 0,
      read_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (user_id),
      FOREIGN KEY (authority_id) REFERENCES authorities (authority_id)
    )`,

    // Alert configurations table
    `CREATE TABLE IF NOT EXISTS alert_configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      config_type TEXT NOT NULL,
      alert_level TEXT NOT NULL,
      distance_miles REAL NOT NULL,
      message_template TEXT,
      sound_file TEXT,
      vibration_pattern TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(config_id)
    )`,

    // Branding configurations table
    `CREATE TABLE IF NOT EXISTS branding_configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branding_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      app_name TEXT DEFAULT 'RailForge Analytics',
      primary_color TEXT DEFAULT '#000000',
      secondary_color TEXT DEFAULT '#FFFFFF',
      accent_color TEXT DEFAULT '#FFD100',
      logo_url TEXT,
      splash_screen_url TEXT,
      app_icon_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branding_id)
    )`,

    // Sync queue table
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      operation TEXT NOT NULL,
      sync_data TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_attempt DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Offline downloads table
    `CREATE TABLE IF NOT EXISTS offline_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agency_id INTEGER NOT NULL,
      subdivision_id INTEGER,
      download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_size_mb REAL,
      is_complete BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (user_id),
      FOREIGN KEY (agency_id) REFERENCES agencies (agency_id),
      FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id)
    )`
  ],

  CREATE_INDEXES: [
    // Index for faster authority lookups
    `CREATE INDEX IF NOT EXISTS idx_authorities_active ON authorities(is_active, subdivision_id, track_type, track_number)`,
    
    // Index for GPS logs
    `CREATE INDEX IF NOT EXISTS idx_gps_logs_user ON gps_logs(user_id, created_at DESC)`,
    
    // Index for alert logs
    `CREATE INDEX IF NOT EXISTS idx_alert_logs_user ON alert_logs(user_id, created_at DESC)`,
    
    // Index for sync queue
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(sync_status, created_at)`,
    
    // Index for tracks
    `CREATE INDEX IF NOT EXISTS idx_tracks_subdivision ON tracks(subdivision_id, bmp, emp)`,
    
    // Index for mileposts
    `CREATE INDEX IF NOT EXISTS idx_milepost_subdivision ON milepost_geometry(subdivision_id, mp)`
  ]
};
