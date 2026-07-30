const { Server } = require('socket.io');

let io;
// Map userId -> Set of socketIds (supports multiple tabs)
const onlineUsers = new Map();

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5000',
        'https://edu-connect-3.vercel.app',
        'https://edu-connect-fwoo.onrender.com',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join personal room for real-time notifications
    socket.on('join_room', (userId) => {
      socket.join(userId);
      
      // Track all socket IDs for this user (supports multiple tabs)
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);
      
      // Only emit online if user was previously offline
      if (onlineUsers.get(userId).size === 1) {
        io.emit('online_status', { userId, isOnline: true });
      }
      console.log(`User ${userId} joined their room (connections: ${onlineUsers.get(userId).size})`);
    });

    // Handle typing events
    socket.on('typing', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('is_typing', { conversationId, userId });
    });

    socket.on('stop_typing', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('stopped_typing', { conversationId, userId });
    });

    // Join conversation room for chat
    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
    });

    // Handle mark as read
    socket.on('mark_read', ({ messageId, conversationId, userId }) => {
      io.to(conversationId).emit('message_read', { messageId, userId });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      // Find user by socket ID and remove this socket
      for (const [userId, socketIds] of onlineUsers.entries()) {
        if (socketIds.has(socket.id)) {
          socketIds.delete(socket.id);
          // Only emit offline if ALL sockets for this user are disconnected
          if (socketIds.size === 0) {
            onlineUsers.delete(userId);
            io.emit('online_status', { userId, isOnline: false });
            console.log(`User ${userId} is now offline (all connections closed)`);
          } else {
            console.log(`User ${userId} still has ${socketIds.size} active connection(s)`);
          }
          break;
        }
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const getOnlineUsers = () => onlineUsers;

module.exports = { initSocket, getIO, getOnlineUsers };