const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const passport = require('passport');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);

// Google OAuth routes
router.get('/google/login', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  authController.passportCallback
);

router.get('/profile', verifyToken, authController.getProfile);
router.post('/complete-profile', verifyToken, authController.completeProfile);
router.get('/public-stats', verifyToken, authController.getPublicStats);

module.exports = router;
