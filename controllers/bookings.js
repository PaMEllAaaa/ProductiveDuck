const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');
const Service = require('../models/Service');
const User = require('../models/User');

const getBookingDay = (value) => {
    // recieve Date from MongoDB
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }

        return value.toISOString().slice(0, 10);
    }

    if (typeof value !== 'string') {
        return null;
    }

    // recieve YYYY-MM-DD from frontend
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(`${value}T00:00:00.000Z`);

        if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
        ) {
            return null;
        }

        return value;
    }

    return null;
};

const validateBookingData = async (
    hotelId,
    checkInDate,
    checkOutDate,
    serviceSelections,
    oldBooking = null
) => {
    // check valid day
    const checkInDay = getBookingDay(checkInDate);
    const checkOutDay = getBookingDay(checkOutDate);

    if (!checkInDay || !checkOutDay) {
        return 'Please provide valid dates in YYYY-MM-DD format';
    }

    const nights = (new Date(checkOutDay) - new Date(checkInDay)) / (1000 * 60 * 60 * 24);
    if (nights < 1 || nights > 3) {
        return 'You can book between 1 and 3 nights';
    }

    // check valid services
    if (!Array.isArray(serviceSelections)) {
        return 'serviceSelections must be an array';
    }

    const selectedDates = [];
    for (const selection of serviceSelections) { 
        if (!selection || typeof selection !== 'object') {
            return 'Invalid service selection';
        }

        const serviceDay = getBookingDay(selection.date);

        if (!serviceDay) {
            return 'Please provide a valid service date in YYYY-MM-DD format';
        }

        if (serviceDay < checkInDay || serviceDay >= checkOutDay) {
            return 'Service date must be within the stay, excluding check-out day';
        }

        if (selectedDates.includes(serviceDay)) {
            return 'Cannot have duplicate service dates';
        }

        selectedDates.push(serviceDay);

        if (!Array.isArray(selection.services)) {
            return 'services must be an array';
        }

        if (selection.services.length > 2) {
            return 'You can select up to 2 services per day';
        }

        // Check valid service in day of selection
        const selectedIds = [];
        for (const serviceId of selection.services) {
            const id = String(serviceId).toLowerCase();

            if (!/^[a-f0-9]{24}$/.test(id)) {
                return 'Invalid service ID';
            }

            if (selectedIds.includes(id)) {
                return 'Cannot select the same service twice in one day';
            }

            selectedIds.push(id);

            const service = await Service.findOne({
                _id: id,
                hotel: hotelId
            });

            if (!service) {
                return 'Service not found in this hotel';
            }

            // count every user who booked this day
            const filter = {
                hotel: hotelId,
                serviceSelections: {
                    $elemMatch: {
                        date: serviceDay,
                        services: service._id
                    }
                }
            };

            if (oldBooking) { // not include this booking if this is oldbooking
                filter._id = { $ne: oldBooking._id };
            }

            const booked = await Booking.countDocuments(filter);

            if (booked >= service.dailyCapacity) {
                return `Service '${service.name}' is fully booked on ${serviceDay}`;
            }
        }
    }

    return null;
};

//@desc Get all bookings
//@route GET /api/v1/bookings
//@access Public
exports.getBookings = async (req, res, next) => {
    let filter = {};

    // General users can see only their own bookings!
    if (req.user.role !== 'admin') {
        filter.user = req.user.id;
    }

    if (req.params.hotelId) {
        filter.hotel = req.params.hotelId;
    }

    let query = Booking.find(filter);
    
    // Select Fields
    if (req.query.select) {
        const selectFields = req.query.select.split(',');

        if (selectFields.includes('hotel')) {
            query = query.populate({
                path: 'hotel',
                select: 'name province tel'
            });
        }
        if (selectFields.includes('serviceSelections')) {
            query = query.populate({
                path: 'serviceSelections.services',
                select: 'name description'
            });
        }
        if (selectFields.includes('user')) {
            query = query.populate({
                path: 'user',
                select: 'name email'
            });
        }

        const fields = selectFields.join(' ');
        query = query.select(fields);
    } else {
        query = query
            .populate({
                path: 'hotel',
                select: 'name province tel'
            })
            .populate({
                path: 'serviceSelections.services',
                select: 'name description'
            });
    }
    // Sort Fields
    if (req.query.sort) {
        const sortBy = req.query.sort.split(',').join(' ');
        query = query.sort(sortBy);
    } else {
        query = query.sort('-createdAt');
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    try {
        if (req.params.hotelId) {
            query = query.where('hotel').equals(req.params.hotelId);
        }

        const total = await Booking.countDocuments(query.getFilter());

        query = query.skip(startIndex).limit(limit);

        // Execute query
        const bookings = await query;

        // Pagination result
        const pagination = {};

        if (endIndex < total) {
            pagination.next = {
                page: page + 1,
                limit
            };
        }

        if (startIndex > 0) {
            pagination.prev = {
                page: page - 1,
                limit
            };
        }

        res.status(200).json({
            success: true,
            count: bookings.length,
            pagination,
            data: bookings
        });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
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
                path: 'serviceSelections.services',
                select: 'name description dailyCapacity'
            });

        if (!booking) {
            return res.status(404).json({ success: false, message: `No booking with id of ${req.params.id}` });
        }

        // only booking owner and admin can see this booking
        if ( booking.user.toString() !== req.user.id && req.user.role !== 'admin' ) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view this booking'
            });
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
        const body = req.body || {};
        const hotelId = req.params.hotelId;

        if (!hotelId) {
            return res.status(400).json({
                success: false,
                message: 'Please create a booking through its hotel'
            });
        }

        if (body.hotel !== undefined && body.hotel !== hotelId) {
            return res.status(400).json({
                success: false,
                message: 'Hotel ID must match the hotel in the URL'
            });
        }

        let userId = req.user.id;

        if (req.user.role === 'admin') {
            if (!body.user) {
                return res.status(400).json({
                    success: false,
                    message: 'Admin must specify a user ID'
                });
            }

            const user = await User.findById(body.user);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            userId = user.id;
            
        } else if (body.user !== undefined && body.user !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot create a booking for another user'
            });
        }

        const hotel = await Hotel.findById(hotelId);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        const serviceSelections = body.serviceSelections !== undefined ? body.serviceSelections : [];

        const message = await validateBookingData(
            hotel._id,
            body.checkInDate,
            body.checkOutDate,
            serviceSelections
        );

        if (message) {
            return res.status(400).json({
                success: false,
                message
            });
        }

        const booking = await Booking.create({
            user: userId,
            hotel: hotel._id,
            checkInDate: body.checkInDate,
            checkOutDate: body.checkOutDate,
            serviceSelections
        });

        return res.status(201).json({
            success: true,
            data: booking
        });
    } catch (err) {
        console.log(err.stack);

        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

//@desc Update booking
//@route PUT /api/v1/bookings/:id
//@access Private
exports.updateBooking = async (req, res, next) => {
    try {
        const body = req.body || {};
        let booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this booking'
            });
        }

        if (body.hotel !== undefined && body.hotel !== booking.hotel.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change the hotel of an existing booking'
            });
        }

        if (body.user !== undefined && body.user !== booking.user.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change the owner of an existing booking'
            });
        }

        const hotel = await Hotel.findById(booking.hotel);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        const targetCheckIn = body.checkInDate !== undefined ? body.checkInDate : booking.checkInDate;
        const targetCheckOut = body.checkOutDate !== undefined ? body.checkOutDate : booking.checkOutDate;
        const targetSelections = body.serviceSelections !== undefined ? body.serviceSelections : booking.serviceSelections;

        const message = await validateBookingData(
            booking.hotel,
            targetCheckIn,
            targetCheckOut,
            targetSelections,
            booking
        );

        if (message) {
            return res.status(400).json({
                success: false,
                message
            });
        }

        const updateData = {
            checkInDate: targetCheckIn,
            checkOutDate: targetCheckOut,
            serviceSelections: targetSelections
        };

        booking = await Booking.findByIdAndUpdate(
            req.params.id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );

        // when someone delete this booking while updating
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (err) {
        console.log(err.stack);

        return res.status(400).json({
            success: false,
            message: err.message
        });
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
