const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Public route (accessible for preview)
router.get('/', locationController.getAllLocations);
router.get('/my-status', verifyToken, locationController.getMyStatus);
router.post('/lock', verifyToken, locationController.lockLocation);
router.post('/confirm', verifyToken, locationController.confirmSelection);
router.post('/cancel', verifyToken, locationController.cancelLock);

// Admin only routes
router.post('/', verifyToken, isAdmin, locationController.createLocation);
router.put('/:id', verifyToken, isAdmin, locationController.updateLocation);
router.delete('/:id', verifyToken, isAdmin, locationController.deleteLocation);

module.exports = router;
