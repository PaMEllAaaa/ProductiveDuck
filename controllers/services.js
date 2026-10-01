const Service = require('../models/Service');
const Hotel = require('../models/Hotel');

//@desc Get all services
//@route  GET /api/v1/services (admin)
//@route  GET /api/v1/hotels/:hotelId/services (user)
//@access Private
exports.getServices = async (req, res, next) => {
    try {
        let query;

        if (req.params.hotelId) {
            const hotel = await Hotel.findById(req.params.hotelId);

            if (!hotel) {
                return res.status(404).json({
                    success: false,
                    message: 'Hotel not found'
                });
            }

            query = Service.find({ hotel: req.params.hotelId });
        } else {
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view all services'
                });
            }

            query = Service.find();
        }

        const services = await query;

        return res.status(200).json({
            success: true,
            count: services.length,
            data: services
        });
    } catch (err) {
        console.log(err);

        return res.status(400).json({
            success: false
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
            service.dailyCapacity = req.body.dailyCapacity;
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