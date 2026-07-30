const Story = require('../models/Story');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload.middleware');

// @desc    F13 — Create a story (institution members only)
// @route   POST /api/stories
const createStory = async (req, res) => {
  try {
    if (!['teacher', 'professor', 'hod', 'principal'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only institution members can create stories.' });
    }

    const { text } = req.body;
    if (!req.file && !text) {
      return res.status(400).json({ message: 'Story must have an image or text.' });
    }

    const storyData = {
      author: req.user._id,
      text: text || '',
    };

    if (req.file) {
      const result = await uploadToCloudinary(req.file, 'educonnect/stories');
      storyData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    const story = await Story.create(storyData);
    const populated = await Story.findById(story._id)
      .populate('author', 'name profilePic institutionName');

    res.status(201).json({ success: true, story: populated });
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    F13 — Get stories (from followed users and own)
// @route   GET /api/stories
const getStories = async (req, res) => {
  try {
    const following = req.user.following || [];
    const authorIds = [...following, req.user._id];

    const stories = await Story.find({ author: { $in: authorIds } })
      .populate('author', 'name profilePic institutionName institutionPic')
      .sort({ createdAt: -1 });

    // Group by author
    const grouped = {};
    stories.forEach(story => {
      const authorId = story.author._id.toString();
      if (!grouped[authorId]) {
        grouped[authorId] = {
          author: story.author,
          stories: [],
        };
      }
      grouped[authorId].stories.push(story);
    });

    res.json({ success: true, stories: Object.values(grouped) });
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    F13 — Mark a story as viewed
// @route   POST /api/stories/:id/view
const viewStory = async (req, res) => {
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { viewers: req.user._id } },
      { returnDocument: 'after' }
    );

    if (!story) {
      return res.status(404).json({ message: 'Story not found.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    F13 — Delete a story
// @route   DELETE /api/stories/:id
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ message: 'Story not found.' });
    }

    if (story.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own stories.' });
    }

    if (story.image?.publicId) {
      await deleteFromCloudinary(story.image.publicId);
    }

    await story.deleteOne();
    res.json({ success: true, message: 'Story deleted.' });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  createStory,
  getStories,
  viewStory,
  deleteStory,
};