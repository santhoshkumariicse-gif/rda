require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { connectDB, prisma } = require('./config/database');
const { validateEnvironment } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { sanitizeRequest, securityHeaders } = require('./middleware/security');
const { authLimiter, chatLimiter, adminLimiter } = require('./middleware/rateLimit');
const socketService = require('./services/socketService');

// Route imports
const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const ownerRoutes = require('./routes/owners');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payment');

// Connect to database
validateEnvironment();
connectDB();

const app = express();
app.disable('x-powered-by');

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        if (process.env.NODE_ENV === 'development') {
          return callback(null, true);
        }

        return callback(new Error('CORS policy blocked requests without an origin'));
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS policy blocked this origin'));
    },
    credentials: true,
  })
);

// Rate limiting – 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
  skip: (req) => req.path.startsWith('/api/health'), // Skip health checks
});

// Stricter rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit exceeded. Please try again later.' },
});

app.use('/api/', limiter);

// ─── Body & logging ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(sanitizeRequest);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', timestamp: new Date(), db: 'connected' });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', timestamp: new Date(), db: 'disconnected' });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚛  LorryBook API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

// Initialize Socket.io
socketService.init(server);

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error during Prisma disconnect:', err.message);
    } finally {
      process.exit(0);
    }
  });
};

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((err) => {
    console.error('Shutdown failed:', err.message);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((err) => {
    console.error('Shutdown failed:', err.message);
    process.exit(1);
  });
});

module.exports = app;
