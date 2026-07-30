const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    image: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    text: {
      type: String,
      maxlength: 200,
      default: '',
    },
    viewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // TTL: 24 hours auto-delete
    },
  }
);

storySchema.index({ author: 1, createdAt: -1 });
// TTL index is already defined via expires: 86400 on the createdAt field

module.exports = mongoose.model('Story', storySchema);