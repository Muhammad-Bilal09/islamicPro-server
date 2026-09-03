const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const quranRoutes = require('./routes/quranRoutes');
const fcmRoutes = require('./routes/fcmRoutes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

connectDB();

const app = express();
app.disable('etag');

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('tiny'));
}

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the IslamicPro Authentication & FCM Server API!',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/fcm', fcmRoutes);

app.use(notFound);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(
      `Server running in [${process.env.NODE_ENV || 'development'}] mode on port ${PORT}`
    );
  });

  process.on('unhandledRejection', (err, promise) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });
}

module.exports = app;
