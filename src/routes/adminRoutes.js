const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Public route for students to see updates
router.get('/public-activities', verifyToken, adminController.getPublicActivities);

// Admin only routes
router.get('/stats', verifyToken, isAdmin, adminController.getDashboardStats);
router.get('/activities', verifyToken, isAdmin, adminController.getRecentActivities);

module.exports = router;
