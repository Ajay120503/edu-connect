const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const { getIO } = require('../config/socket');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload.middleware');

// @desc    Get feed posts (paginated)
// @route   GET /api/posts
const getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { type } = req.query;

    let query = {};
    if (type) {
      query.type = type;
    }

    // If user is logged in, include posts from followed users + their own
    if (req.user) {
      const following = req.user.following || [];
      query.author = { $in: [...following, req.user._id] };
    }

    const posts = await Post.find(query)
      .populate('author', 'name profilePic role category institutionName profilePic')
      .populate({
        path: 'comments',
        select: 'author text likes createdAt',
        populate: {
          path: 'author',
          select: 'name profilePic',
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments(query);

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
    console.error('Get feed error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Create a new post
// @route   POST /api/posts
const createPost = async (req, res) => {
  try {
    const { text, type, tags } = req.body;

    if (!text && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ message: 'Post must have text or images.' });
    }

    // F11 — Role guard for noticeboard posts
    if (type === 'noticeboard' && !['teacher', 'professor', 'hod', 'principal'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only institution members can post notices.' });
    }

    const postData = {
      author: req.user._id,
      text: text || '',
      type: type || 'general',
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [],
      images: [],
    };

    // F11 — Set expiry for noticeboard posts
    if (type === 'noticeboard') {
      postData.noticeboardExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    }

    // Upload images to Cloudinary
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file, 'educonnect/post-images');
        postData.images.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    }

    const post = await Post.create(postData);
    const populatedPost = await Post.findById(post._id)
      .populate('author', 'name profilePic role category institutionName');

    res.status(201).json({ success: true, post: populatedPost });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    // Check ownership
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own posts.' });
    }

    // Delete images from Cloudinary
    for (const image of post.images) {
      await deleteFromCloudinary(image.publicId);
    }

    // Delete associated comments
    await Comment.deleteMany({ post: post._id });

    await post.deleteOne();

    res.json({ success: true, message: 'Post deleted.' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Like / Unlike a post
// @route   POST /api/posts/:id/like
const toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const isLiked = post.likes.includes(req.user._id);

    if (isLiked) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.push(req.user._id);

      // Create notification for post author (if not their own post)
      if (post.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          type: 'post_like',
          message: `${req.user.name} liked your post.`,
          link: `/post/${post._id}`,
        });

        try {
          const io = getIO();
          io.to(post.author.toString()).emit('notification', {
            type: 'post_like',
            message: `${req.user.name} liked your post.`,
            link: `/post/${post._id}`,
          });
        } catch (socketErr) {}
      }
    }

    await post.save();

    res.json({
      success: true,
      isLiked: !isLiked,
      likesCount: post.likes.length,
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Save / Unsave a post
// @route   POST /api/posts/:id/save
const toggleSave = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const isSaved = post.saves.includes(req.user._id);

    if (isSaved) {
      post.saves.pull(req.user._id);
    } else {
      post.saves.push(req.user._id);
    }

    await post.save();

    res.json({
      success: true,
      saved: !isSaved,
      saves: post.saves,
    });
  } catch (error) {
    console.error('Toggle save error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get saved posts
// @route   GET /api/posts/saved
const getSavedPosts = async (req, res) => {
  try {
    const posts = await Post.find({ saves: req.user._id })
      .populate('author', 'name profilePic role category institutionName')
      .populate({
        path: 'comments',
        select: 'author text likes createdAt',
        populate: {
          path: 'author',
          select: 'name profilePic',
        },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, posts });
  } catch (error) {
    console.error('Get saved posts error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get a single post
// @route   GET /api/posts/:id
const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name profilePic role category institutionName')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'name profilePic',
        },
      });

    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    res.json({ success: true, post });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    F11 — Get active noticeboard posts for explore page
// @route   GET /api/posts/noticeboard
const getNoticeboardPosts = async (req, res) => {
  try {
    const notices = await Post.find({
      type: 'noticeboard',
      noticeboardExpiresAt: { $gt: new Date() },
    })
      .populate('author', 'name profilePic role category institutionName institutionPic')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ success: true, notices });
  } catch (error) {
    console.error('Get noticeboard posts error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getFeed,
  createPost,
  deletePost,
  toggleLike,
  toggleSave,
  getSavedPosts,
  getPost,
  getNoticeboardPosts,
};
