const socketIo = require('socket.io');

let io = null;

const initializeSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.NODE_ENV === 'development'
        ? true // Allow all origins in development (mobile clients, emulators, web)
        : process.env.CLIENT_URL,
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Socket middleware for authentication: verify JWT and attach user info
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error: token required'));

      const jwt = require('jsonwebtoken');
      const User = require('../models/User');

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user || !user.Is_Active) return next(new Error('Authentication error'));

      // Attach user to socket for event handlers
      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket auth error:', err && err.message);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Join agency-specific room
    socket.on('join-agency', (agencyId) => {
      socket.join(`agency-${agencyId}`);
      console.log(`Client ${socket.id} joined agency-${agencyId}`);
    });

    // Join user-specific room
    socket.on('join-user', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`Client ${socket.id} joined user-${userId}`);
    });

    // Join authority-specific room for real-time updates
    socket.on('join-authority', (authorityId) => {
      socket.join(`authority-${authorityId}`);
      console.log(`Client ${socket.id} joined authority-${authorityId}`);
    });

    // Handle GPS / location updates from mobile clients (accept multiple event names)
    const handleLocationUpdate = async (data) => {
      try {
        const gpsService = require('../services/gpsService');
        const userId = socket.user ? socket.user.User_ID : (data.userId || null);
        const authorityId = data.authorityId || data.Authority_ID || null;

        // Broadcast update to authority room for other workers
        if (authorityId) {
          socket.to(`authority-${authorityId}`).emit('user-location-update', {
            userId,
            latitude: data.latitude,
            longitude: data.longitude,
            authorityId: authorityId,
            subdivisionId: data.subdivisionId || null,
            trackType: data.trackType || null,
            trackNumber: data.trackNumber || null,
            role: socket.user?.Role || data.role || null,
            accuracy: data.accuracy,
            heading: data.heading,
            speed: data.speed,
            timestamp: new Date()
          });
        }

        // Also process via GPSService (calculate milepost, check alerts)
        try {
          await gpsService.processGPSUpdate({
            userId,
            authorityId,
            latitude: data.latitude,
            longitude: data.longitude,
            speed: data.speed,
            heading: data.heading,
            accuracy: data.accuracy,
            isOffline: false
          });
        } catch (err) {
          console.error('GPSService processing error:', err && err.message);
        }
      } catch (error) {
        console.error('Error processing location update:', error && error.message);
        socket.emit('error', { message: 'Failed to process location update' });
      }
    };

    socket.on('gps-update', handleLocationUpdate);
    socket.on('location-update', handleLocationUpdate);

    // Request current location (for follow-me mode)
    socket.on('request-location', ({ userId }) => {
      socket.to(`user-${userId}`).emit('location-request');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};

const emitToAgency = (agencyId, event, data) => {
  const io = getSocketIO();
  io.to(`agency-${agencyId}`).emit(event, data);
};

const emitToUser = (userId, event, data) => {
  const io = getSocketIO();
  io.to(`user-${userId}`).emit(event, data);
};

const emitToAuthority = (authorityId, event, data) => {
  const io = getSocketIO();
  io.to(`authority-${authorityId}`).emit(event, data);
};

const broadcastCurrentLocation = (userId, locationData) => {
  const io = getSocketIO();
  io.to(`user-${userId}`).emit('current-location', locationData);
};

module.exports = {
  initializeSocket,
  getSocketIO,
  emitToAgency,
  emitToUser,
  emitToAuthority,
  broadcastCurrentLocation
};
