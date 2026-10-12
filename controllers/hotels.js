const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Report = require('../models/Report');

//@desc Get all hotels
//@route GET /api/v1/hotels
//@access Public
exports.getHotels = async (req, res, next) => {
    let query;

    // Copy req.query
    const reqQuery = {...req.query};

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);
    console.log(reqQuery);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    query = Hotel.find(JSON.parse(queryStr))

    // Select Fields
    if (req.query.select) {
        const selectFields = req.query.select.split(',');

        if (selectFields.includes('services')) {
            query = query.populate('services');
        }

        const fields = selectFields.join(' ');
        query = query.select(fields);
    } else {
        query = query.populate('services');
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
        const total = await Hotel.countDocuments();
        query = query.skip(startIndex).limit(limit);
        // Execute query
        const hotels = await query;

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

        res.status(200).json({success: true, count: hotels.length, pagination, data: hotels});
    } catch (err) {
        res.status(400).json({success: false});
    }
};

//@desc Get single hotel
//@route GET /api/v1/hotels/:id
//@access Public
exports.getHotel = async(req, res, next) => {
    try {
        const hotel = await Hotel.findById(req.params.id).populate('services');
        if (!hotel) {
            return res.status(400).json({success: false});
        }
        res.status(200).json({success: true, data: hotel});
    } catch (err) {
        res.status(400).json({success: false});
    }
};

//@desc Create new hotel
//@route POST /api/v1/hotels
//@access Private
exports.createHotel = async(req, res, next) => {
    try {
        const { services, ...hotelData } = req.body;

        const hotel = await Hotel.create(hotelData);

        if (services && Array.isArray(services) && services.length > 0) {
            const servicesWithHotelId = services.map(srv => ({
                ...srv,
                hotel: hotel._id
            }));
            await Service.insertMany(servicesWithHotelId);
        }

        const createdHotel = await Hotel.findById(hotel._id).populate('services');

        res.status(201).json({ success: true, data: createdHotel });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
};

//@desc Update hotel
//@route PUT /api/v1/hotels/:id
//@access Private
exports.updateHotel = async (req, res, next) => {
    try {
        const allowedKeys = ['tel', 'services'];
        const providedKeys = Object.keys(req.body);

        const hasInvalidKeys = providedKeys.some(
            key => !allowedKeys.includes(key) || key.startsWith('$')
        );

        if (hasInvalidKeys) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request. You are only allowed to update "tel" and "services".'
            });
        }

        let hotel = await Hotel.findById(req.params.id);
        if (!hotel) {
            return res.status(404).json({ success: false, message: `No hotel with the id of ${req.params.id}` });
        }

        if (req.body.tel !== undefined) {
            hotel = await Hotel.findByIdAndUpdate(
                req.params.id,
                { tel: req.body.tel },
                { new: true, runValidators: true }
            );
        }

        if (req.body.services && Array.isArray(req.body.services)) {
            const existingServices = await Service.find({ hotel: hotel._id });
            const existingServiceIds = existingServices.map(s => s._id.toString());

            const incomingServices = req.body.services;
            const incomingServiceIds = incomingServices
                .filter(s => s._id)
                .map(s => s._id.toString());

            const servicesToDelete = existingServiceIds.filter(id => !incomingServiceIds.includes(id));
            if (servicesToDelete.length > 0) {
                await Service.deleteMany({ _id: { $in: servicesToDelete } });
            }

            for (let srv of incomingServices) {
                if (srv._id && existingServiceIds.includes(srv._id.toString())) {
                    await Service.findByIdAndUpdate(srv._id, srv, { runValidators: true });
                } else {
                    const newSrv = { ...srv, hotel: hotel._id };
                    delete newSrv._id;
                    await Service.create(newSrv);
                }
            }
        }

        const updatedHotel = await Hotel.findById(req.params.id).populate('services');

        res.status(200).json({ success: true, data: updatedHotel });
    } catch (err) {
        console.log(err.stack);
        res.status(400).json({ success: false, message: err.message });
    }
};

//@desc Delete hotel
//@route DELETE /api/v1/hotels/:id
//@access Private
exports.deleteHotel = async (req, res, next) => {
    try {
        const hotel = await Hotel.findById(req.params.id);
        if (!hotel) {
            return res.status(404).json({success: false, message: `Hotel not found with id of ${req.params.id}`});
        }
        const bookings = await Booking.find({ hotel: hotel._id }).select('_id');
        const bookingIds = bookings.map(booking => booking._id);

        await Report.deleteMany({
            $or: [
                { hotel: hotel._id },
                { booking: { $in: bookingIds } }
            ]
        });
        await Booking.deleteMany({ hotel: hotel._id });
        await Service.deleteMany({ hotel: hotel._id });
        await Hotel.deleteOne({ _id: req.params.id });
        
        res.status(200).json({success: true, data: {}});
    } catch (err) {
        res.status(400).json({success: false});
    }
};