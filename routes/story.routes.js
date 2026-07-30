const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');
const {
  createStory,
  getStories,
  viewStory,
  deleteStory,
} = require('../controllers/story.controller');

// All story routes are protected
router.get('/', authMiddleware, getStories);
router.post('/', authMiddleware, uploadImage.single('image'), createStory);
router.post('/:id/view', authMiddleware, viewStory);
router.delete('/:id', authMiddleware, deleteStory);

module.exports = router;