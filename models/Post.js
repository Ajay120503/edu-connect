const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['general', 'job', 'announcement', 'achievement'],
      default: 'general',
    },
    text: {
      type: String,
      maxlength: [2000, 'Post text cannot exceed 2000 characters'],
      default: '',
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    tags: [{ type: String, trim: true }],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    saves: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
      },
    ],
    jobPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPost',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for feed queries
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ type: 1 });

module.exports = mongoose.model('Post', postSchema);