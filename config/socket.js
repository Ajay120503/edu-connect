const { Server } = require('socket.io');

let io;
const onlineUsers = new Map(); // userId -> socketId mapping

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
      onlineUsers.set(userId, socket.id);
      io.emit('online_status', { userId, isOnline: true });
      console.log(`User ${userId} joined their room`);
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
      // Find and remove user from onlineUsers
      for (const [userId, sockId] of onlineUsers.entries()) {
        if (sockId === socket.id) {
          onlineUsers.delete(userId);
          io.emit('online_status', { userId, isOnline: false });
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