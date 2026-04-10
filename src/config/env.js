const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];

const OPTIONAL_ENV_VARS = ['CLIENT_URL', 'CLIENT_URLS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'GOOGLE_CLIENT_ID', 'GEMINI_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

const validateEnvironment = () => {
  const missingRequired = REQUIRED_ENV_VARS.filter((name) => !String(process.env[name] || '').trim());

  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const missingOptional = OPTIONAL_ENV_VARS.filter((name) => !String(process.env[name] || '').trim());
  if (missingOptional.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn(`Optional environment variables not set: ${missingOptional.join(', ')}`);
  }
};

module.exports = {
  validateEnvironment,
};