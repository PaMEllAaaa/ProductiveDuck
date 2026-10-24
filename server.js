const express = require('express');
const dotenv = require('dotenv');
const cookieParser=require('cookie-parser');
const connectDB = require('./config/db');
const mongoSanitize = require('@exortek/express-mongo-sanitize');
const helmet = require('helmet');
const {xss} = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const hpp=require('hpp');
const cors = require('cors');

// Routes files
const hotels = require('./routes/hotels');
const bookings = require('./routes/bookings');
const auth = require('./routes/auth');
const services = require('./routes/services');
const reports = require('./routes/reports');

dotenv.config({ path: './config/config.env' });

connectDB();

const app = express();

app.set('query parser', 'extended');

app.use(express.json());

// Cookie parser
app.use(cookieParser());

app.use(mongoSanitize());

app.use(helmet());

app.use(xss());

//Rate Limiting
const limiter=rateLimit({
    windowMs:10*60*1000,//10 mins
    max: 100
});
app.use(limiter);

//Prevent http param pollutions
app.use((req,res,next)=>{ Object.defineProperty(req,'query',{value:{...req.query},writable:true}); next(); });
app.use(hpp());

//Enable CORS
app.use(cors());

//Mount routers
app.use('/api/v1/hotels',hotels);
app.use('/api/v1/bookings',bookings);
app.use('/api/v1/auth',auth);
app.use('/api/v1/services', services);
app.use('/api/v1/reports', reports);


const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, console.log('Server running in ', process.env.NODE_ENV, ' mode on port ', PORT));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
});