const mongoose = require('mongoose');

const HotelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
        unique: true,
        trim: true,
        maxlength: [50, 'Name cannot be more than 50 characters']
    },
    address: {
        type: String,
        required: [true, 'Please add an address']
    },
    /*district: {
        type: String,
        required: [true, 'Please add a district']
    },
    province: {
        type: String,
        required: [true, 'Please add a province']
    },
    postalcode: {
        type: String,
        required: [true, 'Please add a postalcode'],
        maxlength: [5, 'Postalcode cannot be more than 5 digits']
    },*/
    tel: {
        type: String
    },
    /*region: {
        type: String,
        required: [true, 'Please add a region']
    }*/
},{
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Reverse populate with virtuals
HotelSchema.virtual('services', {
    ref: 'Service',
    localField: '_id',
    foreignField: 'hotel',
    justOne: false
});

module.exports = mongoose.model('Hotel', HotelSchema);