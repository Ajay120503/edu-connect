const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const {
  getNotifications,
  markAllRead,
  deleteNotification,
} = require('../controllers/notification.controller');

// All notification routes are protected
router.get('/', authMiddleware, getNotifications);
router.put('/read-all', authMiddleware, markAllRead);
router.delete('/:id', authMiddleware, deleteNotification);

module.exports = router;