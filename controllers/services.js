const Service = require('../models/Service');
const Hotel = require('../models/Hotel');
const Booking = require('../models/Booking');

//@desc Get all services
//@route  GET /api/v1/services (admin)
//@route  GET /api/v1/hotels/:hotelId/services (user)
//@access Private
exports.getServices = async (req, res, next) => {
    try {
        let query;
        const { date } = req.query;

        if (date !== undefined) {
            if (
                typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a date in YYYY-MM-DD format'
                });
            }

            const parsedDate = new Date(`${date}T00:00:00.000Z`);

            if ( Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid date'
                });
            }
        }

        if (req.params.hotelId) {
            const hotel = await Hotel.findById(req.params.hotelId);

            if (!hotel) {
                return res.status(404).json({
                    success: false,
                    message: 'Hotel not found'
                });
            }

            query = Service.find({ hotel: hotel._id });
        } else {
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view all services'
                });
            }

            query = Service.find();
        }

        const services = await query.sort('name');

        if (date === undefined) {
            return res.status(200).json({
                success: true,
                count: services.length,
                data: services
            });
        }

        // data of this service
        const data = [];

        for (const service of services) {
            const booked = await Booking.countDocuments({
                hotel: service.hotel,
                serviceSelections: {
                    $elemMatch: {
                        date,
                        services: service._id
                    }
                }
            });

            const remaining = Math.max(0,service.dailyCapacity - booked);

            data.push({
                ...service.toObject(),
                booked,
                remaining,
                available: service.isActive && remaining > 0
            });
        }

        return res.status(200).json({
            success: true,
            date,
            count: data.length,
            data
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

//@desc Get single service
//@route GET /api/v1/services/:id
//@route GET /api/v1/hotels/:hotelId/services/:id
//@access Private
exports.getService = async (req, res, next) => {
    try {
        let service;

        if (req.params.hotelId) {
            const hotel = await Hotel.findById(req.params.hotelId);

            if (!hotel) {
                return res.status(404).json({
                    success: false,
                    message: 'Hotel not found'
                });
            }

            service = await Service.findOne({
                _id: req.params.id,
                hotel: req.params.hotelId
            });
        } else {
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Please view this service through its hotel'
                });
            }

            service = await Service.findById(req.params.id);
        }

        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: service
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false
        });
    }
};

//@desc Add service
//@route POST /api/v1/hotels/:hotelId/services
//@access Private
exports.createService = async(req, res, next) => {
    try {
        const hotel = await Hotel.findById(req.params.hotelId);

        if (!hotel) {
            return res.status(404).json({
                success: false,
                message: 'Hotel not found'
            });
        }

        const { name, description, dailyCapacity, isActive } = req.body;

        const service = await Service.create({
            hotel: hotel._id,
            name,
            description,
            dailyCapacity,
            isActive
        });

        return res.status(201).json({
            success: true,
            data: service
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false
        });
    }
};

//@desc Update service
//@route PUT /api/v1/services/:id
//@access Private
exports.updateService = async (req, res, next) => {
    try {
        const service = await Service.findById(req.params.id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }

        if (req.params.hotelId && service.hotel.toString() !== req.params.hotelId) {
            return res.status(404).json({
                success: false,
                message: 'Service not found in this hotel'
            });
        }

        if (req.body.name !== undefined) {
            service.name = req.body.name;
        }

        if (req.body.description !== undefined) {
            service.description = req.body.description;
        }

        if (req.body.dailyCapacity !== undefined) {
            const newCapacity = req.body.dailyCapacity;

            // cap < 0
            if (!Number.isInteger(newCapacity) || newCapacity < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Daily capacity must be a non-negative integer'
                });
            }

            // Check if cap < all booked
            if (newCapacity < service.dailyCapacity) {
                const today = new Date(Date.now()).toISOString().slice(0, 10);
            
                const bookings = await Booking.find({
                    hotel: service.hotel,
                    serviceSelections: {
                        $elemMatch: {
                            date: { $gte: today },
                            services: service._id
                        }
                    }
                }).select('serviceSelections');

                const bookedByDate = {};

                for (const booking of bookings) {
                    const countedDates = [];

                    for (const selection of booking.serviceSelections) {
                        if (selection.date < today) {
                            continue;
                        }

                        const hasService = selection.services.some(
                            id => id.toString() === service._id.toString()
                        );

                        if (!hasService || countedDates.includes(selection.date)) {
                            continue;
                        }

                        countedDates.push(selection.date);

                        bookedByDate[selection.date] = (bookedByDate[selection.date] || 0) + 1;
                    }
                }

                for (const date of Object.keys(bookedByDate).sort()) {
                    const booked = bookedByDate[date];

                    if (newCapacity < booked) {
                        return res.status(400).json({
                            success: false,
                            message: `Cannot reduce capacity to ${newCapacity}. There are already ${booked} bookings on ${date}`
                        });
                    }
                }
            }

            service.dailyCapacity = newCapacity;
        }

        if (req.body.isActive !== undefined) {
            service.isActive = req.body.isActive;
        }

        await service.save();

        return res.status(200).json({
            success: true,
            data: service
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false
        });
    }
};

//@desc Delete service
//@route DELETE /api/v1/services/:id
//@access Private
exports.deleteService = async (req, res, next) => {
    try {
        const service = await Service.findById(req.params.id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }

        if (req.params.hotelId && service.hotel.toString() !== req.params.hotelId) {
            return res.status(404).json({
                success: false,
                message: 'Service not found in this hotel'
            });
        }

        const booking = await Booking.findOne({
            'serviceSelections.services': service._id
        }).select('_id');

        if (booking) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a service used in bookings. Set isActive to false instead'
            });
        }

        await Service.deleteOne({ _id: service._id });

        return res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false
        });
    }
};