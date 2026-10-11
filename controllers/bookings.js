const Booking = require('../models/Booking');
const Hotel = require('../models/Hotel');
const Service = require('../models/Service');
const User = require('../models/User');

const getBookingDay = (value) => {
    // date object from MongoDB e.g. 2026-11-01T00:00:00.000Z
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null; 
        }
        return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    // string object from request e.g. 2026-02-30
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return null;
    }

    return value;
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

    const nights = (checkOut - checkIn) / (1000 * 60 * 60 * 24);
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

            // update case
            let alreadySelected = false;

            if (oldBooking) {
                alreadySelected = oldBooking.serviceSelections.some(
                    item =>
                        item.date === serviceDay &&
                        item.services.some(
                            oldId => oldId.toString() === service._id.toString()
                        )
                );
            }

            if (!service.isActive && !alreadySelected) {
                return `Service '${service.name}' is inactive`;
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
        if (selectFields.includes('services') || selectFields.includes('serviceSelections')) {
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
        // Check hotel id is matched with URL
        if (req.body.hotel && req.body.hotel !== req.params.hotelId) {
            return res.status(400).json({ success: false, message: 'Hotel ID in request body must match the Hotel ID in the URL' });
        }
        req.body.hotel = req.params.hotelId;

        if (req.user.role === 'admin') {
            // Admin must enter user id 
            if (!req.body.user) {
                return res.status(400).json({ success: false, message: 'Admin must specify a user ID in the request body' });
            }
        } else {
            // User cannot add other user id
            if (req.body.user && req.body.user !== req.user.id) {
                return res.status(403).json({ success: false, message: 'You are not authorized to create a booking for another user' });
            }
            req.body.user = req.user.id;
        }
        
        const hotel = await Hotel.findById(req.params.hotelId);

        if (!hotel) {
            return res.status(404).json({ success: false, message: `No hotel with id of ${req.params.hotelId}` });
        }
        console.log(req.body);

        //add user Id to req.body
        //req.body.user = req.user.id; //มันไป replace user_id = admin
        // //Check for existed booking
        // const existedBookings = await Booking.find({ user: req.user.id });
        // //If the user is not an admin, they can only create 3 booking.
        // if (existedBookings.length >= 3 && req.user.role !== 'admin') {
        //     return res.status(400).json({ success: false, message: `The user with ID ${req.user.id} has already created 3 bookings` });
        // }

        const { checkInDate, checkOutDate, services } = req.body;

        // Check Check in & Check out date
        if (!checkInDate || !checkOutDate) {
            return res.status(400).json({ success: false, message: 'Please provide both checkInDate and checkOutDate' });
        }

        const cIn = new Date(checkInDate);
        const cOut = new Date(checkOutDate);

        if (cOut <= cIn) {
            return res.status(400).json({ success: false, message: 'Check-out date must be after check-in date' });
        }

        // Maximum Booking of 3 nights
        const nightDiff = Math.ceil((cOut.getTime() - cIn.getTime()) / (1000 * 3600 * 24));
        if (nightDiff > 3) {
            return res.status(400).json({ success: false, message: 'You can only book up to 3 nights per booking' });
        }

        // Check Services Validation & Capacity
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

            let currentDate = new Date(cIn);
            currentDate.setHours(0, 0, 0, 0);
            const lastDate = new Date(cOut);
            lastDate.setHours(0, 0, 0, 0);

            while (currentDate < lastDate) {
                const targetDate = new Date(currentDate);
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);

                for (const srv of foundServices) {
                    const count = await Booking.countDocuments({
                        hotel: req.params.hotelId,
                        checkInDate: { $lt: nextDate },
                        checkOutDate: { $gt: targetDate },
                        services: srv._id
                    });

                    if (count >= srv.dailyCapacity) {
                        return res.status(400).json({
                            success: false,
                            message: `Service '${srv.name}' is fully booked on ${targetDate.toISOString().split('T')[0]}`
                        });
                    }
                }
                currentDate.setDate(currentDate.getDate() + 1);
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

        // Cannot change Booking owner and Hotel when update
        if (req.body.hotel && req.body.hotel !== booking.hotel.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot change the hotel of an existing booking' });
        }
        if (req.user.role !== 'admin' && req.body.user && req.body.user !== booking.user.toString()) {
            return res.status(403).json({ success: false, message: 'Cannot change the owner of an existing booking' });
        }

        const targetCheckIn = req.body.checkInDate ? new Date(req.body.checkInDate) : booking.checkInDate;
        const targetCheckOut = req.body.checkOutDate ? new Date(req.body.checkOutDate) : booking.checkOutDate;
        const targetServices = req.body.services !== undefined ? req.body.services : booking.services;

        if (targetCheckOut <= targetCheckIn) {
            return res.status(400).json({ success: false, message: 'Check-out date must be after check-in date' });
        }

        const nightDiff = Math.ceil((targetCheckOut.getTime() - targetCheckIn.getTime()) / (1000 * 3600 * 24));
        if (nightDiff > 3) {
            return res.status(400).json({ success: false, message: 'You can only book up to 3 nights per booking' });
        }

        // Check Services Validation & Capacity On Update
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

            let currentDate = new Date(targetCheckIn);
            currentDate.setHours(0, 0, 0, 0);
            const lastDate = new Date(targetCheckOut);
            lastDate.setHours(0, 0, 0, 0);

            while (currentDate < lastDate) {
                const targetDate = new Date(currentDate);
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);

                for (const srv of foundServices) {
                    const count = await Booking.countDocuments({
                        _id: { $ne: req.params.id }, // Skip own Booking
                        hotel: booking.hotel,
                        checkInDate: { $lt: nextDate },
                        checkOutDate: { $gt: targetDate },
                        services: srv._id
                    });

                    if (count >= srv.dailyCapacity) {
                        return res.status(400).json({
                            success: false,
                            message: `Service '${srv.name}' is fully booked on ${targetDate.toISOString().split('T')[0]}`
                        });
                    }
                }
                currentDate.setDate(currentDate.getDate() + 1);
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
