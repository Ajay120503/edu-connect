const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPost',
      required: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    coverLetter: {
      type: String,
      maxlength: [2000, 'Cover letter cannot exceed 2000 characters'],
      default: '',
    },
    coverLetterFile: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['applied', 'reviewed', 'shortlisted', 'rejected', 'selected'],
      default: 'applied',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate applications
applicationSchema.index({ jobPost: 1, applicant: 1 }, { unique: true });
applicationSchema.index({ applicant: 1, createdAt: -1 });
applicationSchema.index({ jobPost: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);