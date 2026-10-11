const express = require('express');
const { getReports, getReport, addReport, deleteReport } = require('../controllers/reports');

const router = express.Router({ mergeParams: true }); 

const { protect, authorize } = require('../middleware/auth');

router.route('/')
    .get(protect, getReports) // User/Admin get all
    .post(protect, authorize('user', 'admin'), addReport); // User create via bookingId

router.route('/:id')
    .get(protect, getReport)
    .delete(protect, authorize('admin'), deleteReport); // Admin delete only

module.exports = router;