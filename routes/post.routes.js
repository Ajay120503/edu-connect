const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { uploadPostImages } = require('../middlewares/upload.middleware');
const {
  getFeed,
  createPost,
  deletePost,
  toggleLike,
  toggleSave,
  getSavedPosts,
  getPost,
} = require('../controllers/post.controller');

// Public routes (feed can be viewed without auth but with optional auth for personalized feed)
router.get('/', getFeed);
router.get('/saved', authMiddleware, getSavedPosts);
router.get('/:id', getPost);

// Protected routes
router.post('/', authMiddleware, uploadPostImages.array('images', 5), createPost);
router.delete('/:id', authMiddleware, deletePost);
router.post('/:id/like', authMiddleware, toggleLike);
router.post('/:id/save', authMiddleware, toggleSave);

module.exports = router;