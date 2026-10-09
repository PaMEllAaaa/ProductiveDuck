const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    checkInDate: {
        type: Date,
        required: [true, 'Please add a check-in date']
    },
    checkOutDate: {
        type: Date,
        required: [true, 'Please add a check-out date']
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    hotel: {
        type: mongoose.Schema.ObjectId,
        ref: 'Hotel',
        required: true
    },
    serviceSelections: {
        type: [{
            _id: false,
            date: {
                type: String,
                required: [true, 'Please add a service date'],
                match: [
                    /^\d{4}-\d{2}-\d{2}$/,
                    'Service date must be YYYY-MM-DD'
                ]
            },
            services: {
                type: [{
                    type: mongoose.Schema.ObjectId,
                    ref: 'Service'
                }],
                default: [],
                validate: [
                    {
                        validator: function(value) {
                            return value.length <= 2;
                        },
                        message: 'You can select up to 2 services per day'
                    },
                    {
                        validator: function(value) {
                            const ids = value.map(id => id.toString());
                            return new Set(ids).size === ids.length;
                        },
                        message: 'Cannot select the same service twice in one day'
                    }
                ]
            }
        }],
        default: [],
        validate: {
            validator: function(value) {
                const dates = value.map(item => item.date);
                return new Set(dates).size === dates.length;
            },
            message: 'Cannot have duplicate service dates'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Booking', BookingSchema);