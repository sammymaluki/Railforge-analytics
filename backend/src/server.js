require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const { connectToDatabase, closeConnection } = require('./config/database');
const { initializeSocket } = require('./config/socket');
const { requestLogger } = require('./config/logger');
const proximityMonitoringService = require('./services/proximityMonitoringService');

// Import routes
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
const requireHttps = ['1', 'true', 'yes', 'on'].includes(String(process.env.REQUIRE_HTTPS || '').toLowerCase());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
      imgSrc: ['\'self\'', 'data:', 'https:'],
      connectSrc: ['\'self\'', 'ws:', 'wss:']
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? true // Allow all origins in development
    : process.env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Optional hard enforcement for TLS in production deployments behind a proxy/load balancer.
if (requireHttps) {
  app.enable('trust proxy');
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'HTTPS is required'
    });
  });
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', { 
  stream: { write: message => console.log(message.trim()) } 
}));
app.use(requestLogger);

// Static files (pin photos and other uploads)
app.use('/uploads', (req, res, next) => {
  const allowedOrigin = process.env.CLIENT_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../public/uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Sidekick API',
    version: '1.0.0'
  });
});

// API routes
app.use('/api', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectToDatabase();
    
    // Start server - listen on all interfaces for Expo tunnel access
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 Sidekick System
   Server running on port ${PORT}
   Environment: ${process.env.NODE_ENV}
   API URL: http://localhost:${PORT}/api
   Health check: http://localhost:${PORT}/api/health
      `);
    });
    
    // Initialize Socket.IO
    const io = initializeSocket(server);
    
    // Start proximity monitoring service (only in non-test environments)
    if (process.env.NODE_ENV !== 'test') {
      proximityMonitoringService.start(io);
      console.log('✅ Proximity monitoring service started');
    }
    
    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Handle user joining their personal room
      socket.on('join-user', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`Client ${socket.id} joined user-${userId}`);
      });
      
      // Handle agency room joining
      socket.on('join-agency', (agencyId) => {
        socket.join(`agency-${agencyId}`);
        console.log(`Client ${socket.id} joined agency-${agencyId}`);
      });
      
      // Handle location updates from mobile app
      socket.on('location-update', (data) => {
        // Broadcast to agency room for supervisors
        socket.to(`agency-${data.agencyId}`).emit('user-location-update', {
          userId: data.userId,
          latitude: data.latitude,
          longitude: data.longitude,
          authorityId: data.authorityId || null,
          subdivisionId: data.subdivisionId || null,
          trackType: data.trackType || null,
          trackNumber: data.trackNumber || null,
          role: socket.user?.Role || data.role || null,
          timestamp: new Date()
        });
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
    
    // Graceful shutdown
    const gracefulShutdown = async () => {
      console.log('\nShutting down gracefully...');
      
      // Stop proximity monitoring
      proximityMonitoringService.stop();
      console.log('Proximity monitoring service stopped');
      
      server.close(async () => {
        console.log('HTTP server closed');
        await closeConnection();
        console.log('Database connection closed');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app; // For testing
