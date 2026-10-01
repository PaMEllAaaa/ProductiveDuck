const express = require('express');
const {getServices,getService,createService,updateService,deleteService} = require('../controllers/services');

const router = express.Router({ mergeParams: true});

const {protect,authorize} = require('../middleware/auth');

router.route('/').get(protect, getServices).post(protect, authorize('admin'), createService);
router.route('/:id').get(protect, getService).put(protect, authorize('admin'), updateService).delete(protect, authorize('admin'), deleteService);

module.exports = router;