const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');
const {
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
} = require('../controllers/job.controller');

// My jobs routes (MUST be before /:id to avoid route conflicts)
router.get('/my/list', authMiddleware, getMyJobs);

// Application routes (MUST be before /:id to avoid route conflicts)
router.get('/applications/my', authMiddleware, getMyApplications);
router.put('/applications/:id/status', authMiddleware, updateApplicationStatus);

// Public routes
router.get('/', getJobs);
router.get('/:id', getJob);

// Protected routes - Institution members only
router.post('/', authMiddleware, roleMiddleware('teacher', 'professor', 'hod', 'principal'), uploadImage.single('image'), createJob);
router.put('/:id', authMiddleware, roleMiddleware('teacher', 'professor', 'hod', 'principal'), updateJob);
router.delete('/:id', authMiddleware, roleMiddleware('teacher', 'professor', 'hod', 'principal'), deleteJob);

// Student only - apply to job
router.post('/:id/apply', authMiddleware, roleMiddleware('student'), uploadImage.single('coverLetter'), applyToJob);

// Job poster only - view applicants
router.get('/:id/applicants', authMiddleware, getApplicants);

module.exports = router;