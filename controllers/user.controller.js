const User = require('../models/User');
const Post = require('../models/Post');
const JobPost = require('../models/JobPost');
const Notification = require('../models/Notification');
const { getIO } = require('../config/socket');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload.middleware');

// @desc    Get user profile by ID
// @route   GET /api/users/:id
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/:id
const updateProfile = async (req, res) => {
  try {
    // Ensure user can only update their own profile
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'You can only update your own profile.' });
    }

    const allowedFields = [
      'name', 'bio', 'age', 'dateOfBirth', 'educationLevel',
      'institutionName', 'subject', 'experience',
      'address', 'city', 'state',
      'linkedinUrl', 'profession',
    ];

    const arrayFields = ['skills', 'qualifications', 'interests'];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Parse comma-separated string fields into arrays
    for (const field of arrayFields) {
      if (req.body[field] !== undefined) {
        const value = req.body[field];
        if (typeof value === 'string') {
          updates[field] = value.split(',').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(value)) {
          updates[field] = value;
        }
      }
    }

    // Handle profile picture upload
    if (req.files?.profilePic?.[0]) {
      if (req.user.profilePic?.publicId) {
        await deleteFromCloudinary(req.user.profilePic.publicId);
      }
      const result = await uploadToCloudinary(req.files.profilePic[0], 'educonnect/profile-pics');
      updates.profilePic = { url: result.secure_url, publicId: result.public_id };
    }

    // Handle institution picture upload
    if (req.files?.institutionPic?.[0]) {
      if (req.user.institutionPic?.publicId) {
        await deleteFromCloudinary(req.user.institutionPic.publicId);
      }
      const result = await uploadToCloudinary(req.files.institutionPic[0], 'educonnect/institution-pics');
      updates.institutionPic = { url: result.secure_url, publicId: result.public_id };
    }

    // Handle resume upload
    if (req.files?.resume?.[0]) {
      const result = await uploadToCloudinary(req.files.resume[0], 'educonnect/resumes');
      updates.resumeUrl = result.secure_url;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Follow / Unfollow user
// @route   POST /api/users/:id/follow
const followUser = async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user._id);

    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isFollowing = currentUser.following.includes(req.params.id);

    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(req.params.id);
      userToFollow.followers.pull(req.user._id);
    } else {
      // Follow
      currentUser.following.push(req.params.id);
      userToFollow.followers.push(req.user._id);

      // Create notification
      await Notification.create({
        recipient: req.params.id,
        sender: req.user._id,
        type: 'new_follower',
        message: `${currentUser.name} started following you.`,
        link: `/profile/${req.user._id}`,
      });

      // Send real-time notification
      try {
        const io = getIO();
        io.to(req.params.id).emit('notification', {
          type: 'new_follower',
          message: `${currentUser.name} started following you.`,
        });
      } catch (socketErr) {
        // Socket not initialized yet
      }
    }

    await currentUser.save();
    await userToFollow.save();

    res.json({
      success: true,
      isFollowing: !isFollowing,
      followersCount: userToFollow.followers.length,
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Search users
// @route   GET /api/users/search?q=
const searchUsers = async (req, res) => {
  try {
    const { q, role, institution } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = {};

    if (q) {
      query.$text = { $search: q };
    }

    if (role) {
      query.role = role;
    }

    if (institution) {
      query.institutionName = { $regex: institution, $options: 'i' };
    }

    const users = await User.find(query)
      .select('-password -verificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get user's posts
// @route   GET /api/users/:id/posts
const getUserPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ author: req.params.id })
      .populate('author', 'name profilePic role category institutionName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({ author: req.params.id });

    res.json({
      success: true,
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get user's job posts
// @route   GET /api/users/:id/jobs
const getUserJobs = async (req, res) => {
  try {
    const jobs = await JobPost.find({ postedBy: req.params.id })
      .populate('postedBy', 'name profilePic role category')
      .sort({ createdAt: -1 });

    res.json({ success: true, jobs });
  } catch (error) {
    console.error('Get user jobs error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get user's followers
// @route   GET /api/users/:id/followers
const getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('followers', 'name profilePic role category institutionName');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ success: true, followers: user.followers });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get user's following
// @route   GET /api/users/:id/following
const getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('following', 'name profilePic role category institutionName');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ success: true, following: user.following });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getUserProfile,
  updateProfile,
  followUser,
  searchUsers,
  getUserPosts,
  getUserJobs,
  getFollowers,
  getFollowing,
};