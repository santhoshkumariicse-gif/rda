// Global error handling middleware
const errorHandler = (err, req, res, _next) => {
  console.error('[Error]', err.stack || err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ success: false, message: `${field} already in use` });
  }

  if (err.code === 'P2002') {
    const field = Array.isArray(err.meta?.target) && err.meta.target.length > 0 ? err.meta.target[0] : 'field';
    return res.status(409).json({ success: false, message: `${field} already in use` });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Requested resource not found' });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}: ${err.value}` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const exposedMessage = statusCode >= 500 && isProduction
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  return res.status(statusCode).json({
    success: false,
    message: exposedMessage,
  });
};

module.exports = errorHandler;
