const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'teacher', 'professor', 'hod', 'principal'],
      default: 'student',
    },
    category: {
      type: String,
      enum: ['student', 'school', 'college'],
      default: 'student',
    },
    profilePic: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    institutionName: {
      type: String,
      trim: true,
      default: '',
    },
    institutionPic: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters'],
      default: '',
    },
    age: {
      type: Number,
    },
    dateOfBirth: {
      type: Date,
    },
    educationLevel: {
      type: String,
      enum: ['10th', '12th', 'undergraduate', 'postgraduate', 'phd', ''],
      default: '',
    },
    subject: {
      type: String,
      trim: true,
      default: '',
    },
    experience: {
      type: Number,
      default: 0,
    },
    skills: [{ type: String, trim: true }],
    qualifications: [{ type: String, trim: true }],
    address: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    linkedinUrl: {
      type: String,
      trim: true,
      default: '',
    },
    resumeUrl: {
      type: String,
      default: '',
    },
    profession: {
      type: String,
      trim: true,
      default: '',
    },
    interests: [{ type: String, trim: true }],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedStatus: {
      type: String,
      enum: ['none', 'email', 'institution', 'top_contributor'],
      default: 'none',
    },
    verificationDocuments: [{
      url: { type: String },
      publicId: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],
    openToOpportunities: { type: Boolean, default: false },
    skillEndorsements: {
      type: Map,
      of: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: new Map(),
    },
    timeline: [{
      year: { type: String },
      title: { type: String },
      institution: { type: String },
      type: { type: String, enum: ['school', 'college', 'work', 'achievement'] },
    }],
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
  }
);

// Index for search
userSchema.index({ name: 'text', institutionName: 'text', skills: 'text', subject: 'text' });

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);