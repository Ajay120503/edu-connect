const JobPost = require('../models/JobPost');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const { getIO } = require('../config/socket');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload.middleware');

// @desc    Get all active jobs
// @route   GET /api/jobs
const getJobs = async (req, res) => {
  try {
    const { paid, location, roleType, search, page: pageStr, limit: limitStr } = req.query;
    const page = parseInt(pageStr) || 1;
    const limit = parseInt(limitStr) || 10;
    const skip = (page - 1) * limit;

    let query = { isActive: true };

    if (paid !== undefined) {
      query.isPaid = paid === 'true';
    }

    if (location) {
      query.location = location;
    }

    if (roleType) {
      query.roleType = roleType;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const jobs = await JobPost.find(query)
      .populate('postedBy', 'name profilePic role category institutionName institutionPic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await JobPost.countDocuments(query);

    res.json({
      success: true,
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Create a job post
// @route   POST /api/jobs
const createJob = async (req, res) => {
  try {
    const {
      title, description, institutionName, roleType, isPaid,
      stipend, location, requiredQualifications, skillsRequired,
      deadline, contactEmail, maxApplicants,
    } = req.body;

    if (!title || !description || !deadline || !contactEmail) {
      return res.status(400).json({ message: 'Title, description, deadline, and contact email are required.' });
    }

    const jobData = {
      postedBy: req.user._id,
      institutionName: institutionName || req.user.institutionName || '',
      institutionLogo: req.user.institutionPic || { url: '', publicId: '' },
      title,
      description,
      roleType: roleType || 'teacher',
      isPaid: isPaid === 'true' || isPaid === true,
      stipend: stipend || 0,
      location: location || 'onsite',
      requiredQualifications: requiredQualifications || '',
      skillsRequired: skillsRequired ? (typeof skillsRequired === 'string' ? skillsRequired.split(',').map(s => s.trim()) : skillsRequired) : [],
      deadline: new Date(deadline),
      contactEmail,
      maxApplicants: maxApplicants || 0,
    };

    // Upload job image if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file, 'educonnect/job-images');
      jobData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    const job = await JobPost.create(jobData);
    const populatedJob = await JobPost.findById(job._id)
      .populate('postedBy', 'name profilePic role category institutionName');

    // Notify followers about new job post
    const followers = req.user.followers || [];
    for (const followerId of followers) {
      await Notification.create({
        recipient: followerId,
        sender: req.user._id,
        type: 'job_applied',
        message: `${req.user.name} posted a new job: ${title}`,
        link: `/jobs/${job._id}`,
      });

      try {
        const io = getIO();
        io.to(followerId.toString()).emit('notification', {
          type: 'job_applied',
          message: `${req.user.name} posted a new job: ${title}`,
          link: `/jobs/${job._id}`,
        });
      } catch (socketErr) {}
    }

    res.status(201).json({ success: true, job: populatedJob });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
const getJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id)
      .populate('postedBy', 'name profilePic role category institutionName profilePic')
      .populate('applicants', 'name profilePic skills');

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    res.json({ success: true, job });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Update a job post
// @route   PUT /api/jobs/:id
const updateJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (job.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own job posts.' });
    }

    const allowedFields = [
      'title', 'description', 'roleType', 'isPaid', 'stipend',
      'location', 'requiredQualifications', 'skillsRequired',
      'deadline', 'contactEmail', 'maxApplicants', 'isActive',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        job[field] = req.body[field];
      }
    }

    if (req.body.skillsRequired && typeof req.body.skillsRequired === 'string') {
      job.skillsRequired = req.body.skillsRequired.split(',').map(s => s.trim());
    }

    await job.save();

    res.json({ success: true, job });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Delete a job post
// @route   DELETE /api/jobs/:id
const deleteJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (job.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own job posts.' });
    }

    // Delete job image from Cloudinary
    if (job.image?.publicId) {
      await deleteFromCloudinary(job.image.publicId);
    }

    // Delete associated applications
    await Application.deleteMany({ jobPost: job._id });

    await job.deleteOne();

    res.json({ success: true, message: 'Job post deleted.' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Apply to a job
// @route   POST /api/jobs/:id/apply
const applyToJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (!job.isActive) {
      return res.status(400).json({ message: 'This job is no longer accepting applications.' });
    }

    // Check if already applied
    const existingApplication = await Application.findOne({
      jobPost: job._id,
      applicant: req.user._id,
    });

    if (existingApplication) {
      return res.status(400).json({ message: 'You have already applied to this job.' });
    }

    // Check max applicants
    if (job.maxApplicants > 0 && job.applicants.length >= job.maxApplicants) {
      return res.status(400).json({ message: 'Maximum number of applicants reached.' });
    }

    const { coverLetter } = req.body;

    const applicationData = {
      jobPost: job._id,
      applicant: req.user._id,
      coverLetter: coverLetter || '',
    };

    // Upload cover letter PDF if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file, 'educonnect/resumes');
      applicationData.coverLetterFile = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    const application = await Application.create(applicationData);

    // Add applicant to job
    job.applicants.push(req.user._id);
    await job.save();

    // Notify job poster
    await Notification.create({
      recipient: job.postedBy,
      sender: req.user._id,
      type: 'job_applied',
      message: `${req.user.name} applied for your job: ${job.title}`,
      link: `/jobs/${job._id}`,
    });

    try {
      const io = getIO();
      io.to(job.postedBy.toString()).emit('notification', {
        type: 'job_applied',
        message: `${req.user.name} applied for your job: ${job.title}`,
        link: `/jobs/${job._id}/applicants`,
      });
    } catch (socketErr) {}

    res.status(201).json({ success: true, application });
  } catch (error) {
    console.error('Apply to job error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get applicants for a job
// @route   GET /api/jobs/:id/applicants
const getApplicants = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (job.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view applicants for your own job posts.' });
    }

    const { status } = req.query;

    let query = { jobPost: req.params.id };
    if (status) {
      query.status = status;
    }

    const applications = await Application.find(query)
      .populate(
        'applicant',
        'name profilePic skills qualifications email educationLevel city state bio age experience subject profession institutionName linkedinUrl resumeUrl interests'
      )
      .sort({ createdAt: -1 });

    res.json({ success: true, applications });
  } catch (error) {
    console.error('Get applicants error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Update application status
// @route   PUT /api/applications/:id/status
const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['applied', 'reviewed', 'shortlisted', 'rejected', 'selected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const application = await Application.findById(req.params.id)
      .populate('jobPost', 'postedBy title');

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    // Only job poster can update status
    if (application.jobPost.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update applications for your own job posts.' });
    }

    application.status = status;
    application.notes = req.body.notes || application.notes;
    await application.save();

    // Notify applicant
    await Notification.create({
      recipient: application.applicant,
      sender: req.user._id,
      type: 'application_status',
      message: `Your application for "${application.jobPost.title}" has been ${status}.`,
      link: `/jobs/${application.jobPost._id}`,
    });

    try {
      const io = getIO();
      io.to(application.applicant.toString()).emit('notification', {
        type: 'application_status',
        message: `Your application status updated to: ${status}`,
        link: `/jobs/${application.jobPost._id}`,
      });
    } catch (socketErr) {}

    res.json({ success: true, application });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get user's applications (student's dashboard)
// @route   GET /api/applications/my
const getMyApplications = async (req, res) => {
  try {
    const { status } = req.query;

    let query = { applicant: req.user._id };
    if (status) {
      query.status = status;
    }

    const applications = await Application.find(query)
      .populate({
        path: 'jobPost',
        select: 'title institutionName location roleType isPaid stipend deadline',
        populate: {
          path: 'postedBy',
          select: 'name profilePic',
        },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, applications });
  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get jobs posted by current user
// @route   GET /api/jobs/my/list
const getMyJobs = async (req, res) => {
  try {
    const jobs = await JobPost.find({ postedBy: req.user._id })
      .populate('postedBy', 'name profilePic role category institutionName')
      .sort({ createdAt: -1 });

    // Get application counts for each job
    const jobsWithCounts = await Promise.all(
      jobs.map(async (job) => {
        const applicationCount = await Application.countDocuments({ jobPost: job._id });
        return {
          ...job.toObject(),
          applicationCount,
        };
      })
    );

    res.json({ success: true, jobs: jobsWithCounts });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getJobs,
  createJob,
  getJob,
  updateJob,
  deleteJob,
  applyToJob,
  getApplicants,
  updateApplicationStatus,
  getMyApplications,
  getMyJobs,
};
