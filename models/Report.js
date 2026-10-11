const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reportType: {
        type: String,
        required: [true, 'Please delect a report type'],
        enum: [
            'Room Cleanliness', 
            'Staff Service', 
            'Hotel Facilities', 
            'Safety Issue', 
            'Noise Complaint',
            'Other'
        ]
    },
    description: {
        type: String,
        required: [true, 'Please add a description'],
        trim: true,
        maxlength: [1000, 'Description cannot be more than 1000 characters']
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
    booking: {
        type: mongoose.Schema.ObjectId,
        ref: 'Booking',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Report', ReportSchema);