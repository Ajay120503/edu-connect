const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { uploadChatFile } = require('../middlewares/upload.middleware');
const {
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
  reactToMessage,
} = require('../controllers/chat.controller');

// All chat routes are protected
router.get('/conversations', authMiddleware, getConversations);
router.get('/conversations/:id/messages', authMiddleware, getMessages);
router.post('/conversations', authMiddleware, createConversation);
router.post('/messages', authMiddleware, uploadChatFile.single('file'), sendMessage);
router.put('/messages/:id/read', authMiddleware, markAsRead);
router.post('/messages/:id/react', authMiddleware, reactToMessage);

module.exports = router;