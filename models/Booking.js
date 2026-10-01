const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    bookingDate: {
        type: Date,
        required: true
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
    services: {
        type: [{
            type: mongoose.Schema.ObjectId,
            ref: 'Service'
        }],
        validate: [
            function(val) {
                return val.length <= 2;
            },
            'You can select up to 2 services only'
        ]
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Booking', BookingSchema);