const RESERVED_DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype', '$where', '$regex', '$options', '$inc', '$mul', '$unset', '$set', '$push', '$pull', '$addToSet']);
const DANGEROUS_PATTERNS = [/\$[\w]+/, /\.\./, /<script/i, /javascript:/i, /on\w+\s*=/i];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === 'string') {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error('Potentially dangerous input detected');
      }
    }
    return value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    // Blocks common NoSQL/operator injection and prototype pollution vectors.
    if (RESERVED_DANGEROUS_KEYS.has(key)) continue;
    if (key.startsWith('$')) continue;
    if (key.includes('.')) continue;
    if (typeof key === 'string' && DANGEROUS_PATTERNS.some(pattern => pattern.test(key))) continue;

    sanitized[key] = sanitizeValue(nestedValue);
  }

  return sanitized;
};

exports.sanitizeRequest = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }

  next();
};

exports.securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // HTTP Strict Transport Security (HSTS) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://accounts.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://accounts.google.com; " +
    "frame-src https://accounts.google.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );

  next();
};
