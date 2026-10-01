const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');
const Service = require('../models/Service');

//@desc Get all bookings
//@route GET /api/v1/bookings
//@access Public
exports.getBookings = async (req, res, next) => {
    let query;
    // General users can see only their own bookings!
    if (req.user.role !== 'admin') {
        query = Booking.find({ user: req.user.id }).populate({
            path: 'hotel',
            select: 'name province tel'
        })
        .populate({
            path: 'services',
            select: 'name description'
        });
    } else { //If you are an admin, you can see all bookings!
        if (req.params.hotelId) {
            console.log(req.params.hotelId);
            query = Booking.find({ hotel: req.params.hotelId }).populate({
                path: 'hotel',
                select: 'name province tel'
            })
            .populate({ 
                path: 'services',
                select: 'name description'
            });
        } else {
            query = Booking.find().populate({
                path: 'hotel',
                select: 'name province tel'
            })
            .populate({ 
                path: 'services',
                select: 'name description'
            });
        }
    }
    try {
        const bookings = await query;
        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (err) {
        console.log(err.stack);
        return res.status(500).json({ success: false, message: 'Cannot find Booking' });
    }
};

//@desc Get single booking
//@route GET /api/v1/bookings/:id
//@access Public
exports.getBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate({
                path: 'hotel',
                select: 'name description tel'
            })
            .populate({
                path: 'services',
                select: 'name description dailyCapacity'
            });
        if (!booking) {
            return res.status(404).json({ success: false, message: `No booking with id of ${req.params.id}` });
        }
        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        console.log(err.stack);
        return res.status(500).json({ success: false, message: 'Cannot find Booking' });
    }
};

//@desc Add booking
//@route POST /api/v1/hotels/:hotelId/bookings
//@access Private
exports.addBooking = async (req, res, next) => {
    try {
        req.body.hotel = req.params.hotelId;
        
        const hotel = await Hotel.findById(req.params.hotelId);

        if (!hotel) {
            return res.status(404).json({ success: false, message: `No hotel with id of ${req.params.hotelId}` });
        }
        console.log(req.body);

        //add user Id to req.body
        req.body.user = req.user.id;
        //Check for existed booking
        const existedBookings = await Booking.find({ user: req.user.id });
        //If the user is not an admin, they can only create 3 booking.
        if (existedBookings.length >= 3 && req.user.role !== 'admin') {
            return res.status(400).json({ success: false, message: `The user with ID ${req.user.id} has already created 3 bookings` });
        }

        // Check Services Validation & Capacity
        const { services, bookingDate } = req.body;

        if (services && Array.isArray(services) && services.length > 0) {
            if (services.length > 2) {
                return res.status(400).json({ success: false, message: 'You can select up to 2 services per booking' });
            }

            const foundServices = await Service.find({
                _id: { $in: services },
                hotel: req.params.hotelId,
                isActive: true
            });

            if (foundServices.length !== services.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more selected services are invalid, inactive, or do not belong to this hotel'
                });
            }

            const bDate = new Date(bookingDate);
            const startDate = new Date(bDate.setHours(0, 0, 0, 0));
            const endDate = new Date(bDate.setHours(23, 59, 59, 999));

            for (const srv of foundServices) {
                const count = await Booking.countDocuments({
                    hotel: req.params.hotelId,
                    bookingDate: { $gte: startDate,$lte: endDate },
                    services: srv._id
                });

                if (count >= srv.dailyCapacity) {
                    return res.status(400).json({
                        success: false,
                        message: `Service '${srv.name}' is fully booked on this date`
                    });
                }
            }
        }

        const booking = await Booking.create(req.body);
        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        console.log(err.stack);
        return res.status(500).json({ success: false, message: 'Cannot create Booking' });
    }
};

//@desc Update booking
//@route PUT /api/v1/bookings/:id
//@access Private
exports.updateBooking = async (req, res, next) => {
    try {
        let booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: `No booking with id of ${req.params.id}` });
        }

        //Make sure user is booking owner
        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: `User ${req.user.id} is not authorized to update this booking` });
        }

        // Check Services Validation & Capacity On Update
        const targetServices = req.body.services !== undefined ? req.body.services : booking.services;
        const targetDate = req.body.bookingDate ? req.body.bookingDate : booking.bookingDate;

        if (targetServices && Array.isArray(targetServices) && targetServices.length > 0) {
            // 1. Choose maximum 2 services
            if (targetServices.length > 2) {
                return res.status(400).json({ success: false, message: 'You can select up to 2 services per booking' });
            }

            // 2. Check all services in the hotel
            const foundServices = await Service.find({
                _id: { $in: targetServices },
                hotel: booking.hotel,
                isActive: true
            });

            if (foundServices.length !== targetServices.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more selected services are invalid, inactive, or do not belong to this hotel'
                });
            }

            // 3. Check Daily Capacity
            const bDate = new Date(targetDate);
            const startDate = new Date(bDate.setHours(0, 0, 0, 0));
            const endDate = new Date(bDate.setHours(23, 59, 59, 999));

            for (const srv of foundServices) {
                const count = await Booking.countDocuments({
                    _id: { $ne: req.params.id }, // Skip own Booking
                    hotel: booking.hotel,
                    bookingDate: { $gte: startDate,$lte: endDate },
                    services: srv._id
                });

                if (count >= srv.dailyCapacity) {
                    return res.status(400).json({
                        success: false,
                        message: `Service '${srv.name}' is fully booked on this date`
                    });
                }
            }
        }

        booking = await Booking.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        console.log(err.stack);
        return res.status(500).json({ success: false, message: 'Cannot update Booking' });
    }
};

//@desc Delete booking
//@route DELETE /api/v1/bookings/:id
//@access Private
exports.deleteBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: `No booking with id of ${req.params.id}` });
        }

        //Make sure user is booking owner
        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: `User ${req.user.id} is not authorized to delete this booking` });
        }

        await booking.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.log(err.stack);
        return res.status(500).json({ success: false, message: 'Cannot delete Booking' });
    }
};
