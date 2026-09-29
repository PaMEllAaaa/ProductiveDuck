const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    hotel: {
        type: mongoose.Schema.ObjectId,
        ref: 'Hotel',
        required: [true, 'Please specify a hotel']
    },
    name: {
        type: String,
        required: [true, 'Please add a service name'],
        trim: true,
        lowercase: true,
        maxlength: [50, 'Service name cannot be more than 50 characters']
    },
    description: {
        type: String,
        trim: true
    },
    dailyCapacity: {
        type: Number,
        required: [true, 'Please add a daily capacity'],
        min: [0, 'Daily capacity cannot be negative'],
        validate: {
            validator: Number.isInteger,
            message: 'Daily capacity must be an integer'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

ServiceSchema.index({ hotel: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Service', ServiceSchema);