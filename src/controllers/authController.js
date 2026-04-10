const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const { prisma } = require('../config/database');
const notificationService = require('../services/notificationService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const isAllowedGmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith('@gmail.com');
const isAllowedAuthEmail = (email) => {
  const normalized = String(email || '').toLowerCase().trim();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  return isAllowedGmail(normalized) || (adminEmail && normalized === adminEmail);
};

// Generate JWT token
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};
const comparePassword = async (candidatePassword, hash) => {
  if (!hash) return false;
  return await bcrypt.compare(candidatePassword, hash);
};

// @desc    Register a new user (driver or owner)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, phone, role, profileData, termsVersion, privacyVersion } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

    let hashedPassword = null;
    if (password) {
      hashedPassword = await hashPassword(password);
    }

    // Use Prisma transaction to create user and profile
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          phone,
          role,
          isVerified: false,
          verificationToken: hashedVerificationToken,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          termsVersion,
          privacyAccepted: true,
          privacyAcceptedAt: new Date(),
          privacyVersion,
        }
      });

      if (role === 'driver') {
        const {
          licenseNumber, licenseType, licenseExpiry,
          yearsExperience, baseLocation, bio,
        } = profileData || {};

        // Validate required driver fields
        if (!licenseNumber) {
          throw new Error('License number is required for driver registration');
        }
        if (!licenseType) {
          throw new Error('License type is required for driver registration');
        }
        if (!licenseExpiry) {
          throw new Error('License expiry date is required for driver registration');
        }

        const newDriver = await tx.driver.create({
          data: {
            userId: newUser.id,
            licenseNumber,
            licenseType,
            licenseExpiry: new Date(licenseExpiry).toISOString(),
            yearsExperience: yearsExperience || 0,
            baseLocation: baseLocation || {},
            bio,
          }
        });

        await tx.availability.create({
          data: {
            driverId: newDriver.id,
            weeklySchedule: []
          }
        });
      }

      if (role === 'owner') {
        const {
          companyName, companyRegistrationNo, vatNumber,
          address, contactPerson,
        } = profileData || {};

        // Validate required owner fields
        if (!companyName) {
          throw new Error('Company name is required for owner registration');
        }

        await tx.lorryOwner.create({
          data: {
            userId: newUser.id,
            companyName,
            companyRegistrationNo,
            vatNumber,
            address: address ? address : undefined,
            contactPerson: contactPerson ? contactPerson : undefined,
          }
        });
      }
      return newUser;
    });

    // In development mode (no SMTP configured), auto-verify the user account for easier testing
    if (!process.env.SMTP_USER && process.env.NODE_ENV === 'development') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, verificationToken: null }
      });
      console.log(`[Development] Auto-verified user: ${user.email}`);
      return res.status(201).json({ 
        success: true, 
        message: 'Registration successful! You can now log in immediately (auto-verified in development mode).' 
      });
    }

    // Production mode: Send verification email
    const baseClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyUrl = `${baseClientUrl}/verify-email/${verificationToken}`;

    try {
      await notificationService.sendVerificationEmail(user.email, user.name, verifyUrl);
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr);
    }

    return res.status(201).json({ success: true, message: 'Registration successful. Please check your email to verify your account.' });
  } catch (err) {
    console.error('register error:', err);
    // Check if it's a custom validation error we threw
    if (err.message && err.message.includes('required')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    // Check for unique constraint violations
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(409).json({ success: false, message: `This ${field} is already in use` });
    }
    // Check for invalid data errors
    if (err.message && err.message.includes('Invalid')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const email = String(req.body.email || '').toLowerCase().trim();
  const { password } = req.body;

  try {
    let user = await prisma.user.findUnique({ where: { email } });
    const isMatch = user && await comparePassword(password, user.password);

    if (!user || !isMatch) {
      if (user) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'FAILED_LOGIN',
            resource: 'USER',
            details: {
              email,
              reason: 'Invalid credentials',
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.get('User-Agent'),
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            severity: 'HIGH',
          }
        }).catch(() => {});
      }
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      const isDevAutoVerify = process.env.NODE_ENV === 'development' && !process.env.SMTP_USER;
      if (isDevAutoVerify) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, verificationToken: null }
        });
        console.log(`[Development] Auto-verified on login: ${user.email}`);
      } else {
        return res.status(403).json({ success: false, message: 'Please verify your email address before logging in' });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    const token = signToken(user.id);
    const userOut = { _id: user.id, id: user.id, name: user.name, email: user.email, role: user.role };

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        resource: 'USER',
        details: {
          email: user.email,
          role: user.role,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM',
      }
    });

    return res.status(200).json({ success: true, token, user: userOut });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get current authenticated user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, isVerified: true, isActive: true }
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let profile = null;
    if (user.role === 'driver') {
      profile = await prisma.driver.findUnique({ where: { userId: user.id } });
    } else if (user.role === 'owner') {
      profile = await prisma.lorryOwner.findUnique({ where: { userId: user.id } });
    }

    return res.status(200).json({ success: true, user: { ...user, _id: user.id }, profile });
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isMatch = await comparePassword(currentPassword, user.password);

    if (!isMatch) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'FAILED_PASSWORD_CHANGE',
          resource: 'USER',
          details: {
            reason: 'Current password incorrect',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          severity: 'HIGH',
        }
      });
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'PASSWORD_CHANGE',
        resource: 'USER',
        details: {
          email: req.user.email,
          role: req.user.role,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        severity: 'HIGH',
      }
    });

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Request password reset link
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!isAllowedAuthEmail(email)) {
      return res.status(400).json({ success: false, message: 'Only Gmail addresses are allowed (except configured admin email)' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset link has been sent to the email.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    const baseClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${baseClientUrl}/reset-password/${resetToken}`;

    try {
      await notificationService.sendPasswordResetEmail(user.email, user.name, resetUrl);
    } catch (mailErr) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: null,
          resetPasswordExpire: null
        }
      });
      throw mailErr;
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists, a reset link has been sent to the email.',
    });
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Reset password with token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or expired' });
    }

    const hashedPassword = await hashPassword(req.body.password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpire: null
      }
    });

    return res.status(200).json({ success: true, message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Sign in / sign up with Google
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
  const { credential, role, termsAccepted, termsVersion, privacyAccepted, privacyVersion } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified: emailVerified } = payload;

    if (!emailVerified || !isAllowedGmail(email)) {
      return res.status(403).json({ success: false, message: 'Only verified Gmail accounts are allowed' });
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] }
    });

    if (!user) {
      if (!role || !['driver', 'owner'].includes(role)) {
        return res.status(400).json({ success: false, needsRole: true, message: 'Please select a role to continue' });
      }
      if (termsAccepted !== true || !termsVersion) {
        return res.status(400).json({ success: false, message: 'Terms and Conditions must be accepted' });
      }
      if (privacyAccepted !== true || !privacyVersion) {
        return res.status(400).json({ success: false, message: 'Privacy Policy must be accepted' });
      }

      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name, email, googleId, role, avatar: picture || null,
            isVerified: true, isActive: true,
            termsAccepted: true, termsAcceptedAt: new Date(), termsVersion,
            privacyAccepted: true, privacyAcceptedAt: new Date(), privacyVersion,
          }
        });
        if (role === 'driver') {
          const newDriver = await tx.driver.create({ data: { userId: newUser.id, licenseNumber: googleId, licenseType: 'MGV', licenseExpiry: new Date(), baseLocation: {} } });
          await tx.availability.create({ data: { driverId: newDriver.id } });
        } else if (role === 'owner') {
          await tx.lorryOwner.create({ data: { userId: newUser.id, companyName: name } });
        }
        return newUser;
      });
    } else {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatar: user.avatar || picture || null }
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    const token = signToken(user.id);
    const userOut = { _id: user.id, id: user.id, name: user.name, email: user.email, role: user.role };
    return res.status(200).json({ success: true, token, user: userOut });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(401).json({ success: false, message: 'Google authentication failed' });
  }
};

// @desc    Upload user avatar
// @route   POST /api/auth/avatar
// @access  Private
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: avatarUrl }
    });

    return res.status(200).json({ success: true, avatarUrl, message: 'Avatar updated successfully' });
  } catch (err) {
    console.error('Upload avatar error:', err);
    return res.status(500).json({ success: false, message: 'Server error during avatar upload' });
  }
};

// @desc    Logout user and blacklist token
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.decode(token);
      const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.tokenBlacklist.create({ data: { token, expiresAt } })
        .catch(e => console.error("Blacklist error:", e));
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LOGOUT',
        resource: 'USER',
        details: {
          email: req.user.email,
          role: req.user.role,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        severity: 'MEDIUM',
      }
    });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ success: false, message: 'Server error during logout' });
  }
};

// @desc    Verify email with token
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await prisma.user.findFirst({ where: { verificationToken: hashedToken } });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null
      }
    });

    return res.status(200).json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('verifyEmail error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Manually verify email (development-only)
// @route   POST /api/auth/verify-email-manual
// @access  Public (development only)
exports.verifyEmailManual = async (req, res) => {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ success: false, message: 'This endpoint is only available in development mode' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null
      }
    });

    console.log(`[Development] Manually verified email: ${email}`);
    return res.status(200).json({ success: true, message: `Email ${email} verified successfully. You can now log in.` });
  } catch (err) {
    console.error('verifyEmailManual error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

