const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { uploadProfile } = require('../middlewares/upload.middleware');
const {
  getUserProfile,
  updateProfile,
  followUser,
  searchUsers,
  getUserPosts,
  getUserJobs,
  getFollowers,
  getFollowing,
} = require('../controllers/user.controller');

// Public routes
router.get('/search', searchUsers);
router.get('/:id', getUserProfile);
router.get('/:id/posts', getUserPosts);
router.get('/:id/jobs', getUserJobs);
router.get('/:id/followers', getFollowers);
router.get('/:id/following', getFollowing);

// Protected routes
router.put('/:id', authMiddleware, uploadProfile.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'institutionPic', maxCount: 1 },
  { name: 'resume', maxCount: 1 }
]), updateProfile);
router.post('/:id/follow', authMiddleware, followUser);

module.exports = router;