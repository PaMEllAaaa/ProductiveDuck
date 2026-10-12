const express = require('express');
const {getBookings, getBooking, addBooking, updateBooking, deleteBooking} = require('../controllers/bookings');

// Include other resource routers
const reportRouter = require('./reports');

const router = express.Router({ mergeParams: true});

const {protect,authorize} = require('../middleware/auth');

// Re-route into other resource routers
router.use('/:bookingId/reports', reportRouter);

router.route('/')
.get(protect, getBookings)
.post(protect, authorize('admin', 'user'),addBooking);
router.route('/:id')
.get(protect, getBooking)
.put(protect, authorize('admin', 'user'), updateBooking)
.delete(protect, authorize('admin', 'user'), deleteBooking);

module.exports = router;