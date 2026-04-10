const { prisma } = require('../config/database');

// Audit logging middleware
const auditLog = (action, resource = null, severity = 'LOW') => {
  return async (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      const userId = req.user?.id || null;

      if (!userId) {
        return;
      }

      // Only log security-relevant actions or errors
      if (severity !== 'LOW' || statusCode >= 400 || action.includes('LOGIN') || action.includes('LOGOUT')) {
        const auditEntry = {
          userId,
          action,
          resource,
          resourceId: req.params.id || req.body.id || null,
          details: {
            method: req.method,
            url: req.originalUrl,
            statusCode,
            duration,
            userAgent: req.get('User-Agent'),
            body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          severity: statusCode >= 500 ? 'HIGH' : statusCode >= 400 ? 'MEDIUM' : severity,
        };

        // Log asynchronously without blocking response
        prisma.auditLog.create({ data: auditEntry }).catch(err => {
          console.error('Audit log error:', err);
        });
      }
    });

    next();
  };
};

// Sanitize sensitive data from request body
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'credential'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

// Specific audit middlewares for common actions
const auditLogin = auditLog('LOGIN', 'USER', 'MEDIUM');
const auditLogout = auditLog('LOGOUT', 'USER', 'MEDIUM');
const auditFailedLogin = auditLog('FAILED_LOGIN', 'USER', 'HIGH');
const auditPasswordChange = auditLog('PASSWORD_CHANGE', 'USER', 'HIGH');
const auditAvatarUpload = auditLog('AVATAR_UPLOAD', 'FILE', 'MEDIUM');
const auditBookingAction = (action) => auditLog(action, 'BOOKING', 'MEDIUM');
const auditPayment = auditLog('PAYMENT_PROCESSED', 'PAYMENT', 'HIGH');
const auditAdminAction = auditLog('ADMIN_ACTION', 'SYSTEM', 'HIGH');
const auditSuspiciousActivity = auditLog('SUSPICIOUS_ACTIVITY', 'SYSTEM', 'CRITICAL');

module.exports = {
  auditLog,
  auditLogin,
  auditLogout,
  auditFailedLogin,
  auditPasswordChange,
  auditAvatarUpload,
  auditBookingAction,
  auditPayment,
  auditAdminAction,
  auditSuspiciousActivity,
};