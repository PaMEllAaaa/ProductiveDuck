const Report = require('../models/Report');
const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');

//@desc Get all reports
//@route  GET /api/v1/reports
//@access Private
exports.getReports = async (req, res, next) => {
    let filter = {};

    // User can only see their own reports
    if (req.user.role !== 'admin') {
        filter.user = req.user.id;
    }

    let query = Report.find(filter);

    // Select Fields
    if (req.query.select && req.user.role === 'admin') {
        const fields = req.query.select.split(',').join(' ');
        query = query.select(fields);
    }

    // Populate 
    query = query.populate({
        path: 'hotel',
        select: 'name province'
    }).populate({
        path: 'user',
        select: 'name email'
    }).populate({
        path: 'booking',
        select: 'checkInDate checkOutDate'
    });

    // Sort Fields
    if (req.query.sort) {
        if (req.user.role === 'admin') {
            const sortBy = req.query.sort.split(',').join(' ');
            query = query.sort(sortBy);
        } else {
            if (req.query.sort === 'createdAt' || req.query.sort === '-createdAt') {
                query = query.sort(req.query.sort);
            } else {
                query = query.sort('-createdAt'); 
            }
        }
    } else {
        query = query.sort('-createdAt');
    }

    try {
        const reports = await query;

        res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
}

//@desc     Get single report
//@route    GET /api/v1/reports/:id
//@access   Private
exports.getReport = async (req, res, next) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate({
                path: 'hotel',
                select: 'name province'
            })
            .populate({
                path: 'user',
                select: 'name email'
            })
            .populate({
                path: 'booking',
                select: 'checkInDate checkOutDate'
            });

        if (!report) {
            return res.status(404).json({ success: false, message: `No report found with id of ${req.params.id}` });
        }

        // only report owner and admin can see this report
        if (report.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'You are not authorized to view this report' });
        }

        res.status(200).json({
            success: true,
            data: report
        });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
};

//@desc     Create a report
//@route    POST /api/v1/bookings/:bookingId/reports
//@access   Private (User only)
exports.addReport = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: `No booking with id of ${req.params.bookingId}` });
        }

        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only report issues for your own bookings' });
        }

        if (!booking.checkOutDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'This booking does not have a valid check-out date' 
            });
        }

        const currentDate = new Date();
        const checkOutDate = new Date(booking.checkOutDate);

        if (currentDate < checkOutDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'You can only submit a report after your check-out date' 
            });
        }

        const oneMonthInMs = 30 * 24 * 60 * 60 * 1000;
        if (currentDate.getTime() - checkOutDate.getTime() > oneMonthInMs) {
            return res.status(400).json({ 
                success: false, 
                message: 'You can only submit a report within 1 month after check-out' 
            });
        }

        req.body.booking = req.params.bookingId; 
        req.body.user = req.user.id;
        req.body.hotel = booking.hotel;

        const report = await Report.create(req.body);

        res.status(201).json({
            success: true,
            data: report
        });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
};

//@desc     Delete report
//@route    DELETE /api/v1/reports/:id
//@access   Private (Admin Only)
exports.deleteReport = async (req, res, next) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ success: false, message: `No report found with id of ${req.params.id}` });
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to delete reports' });
        }

        await report.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
};