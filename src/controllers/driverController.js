const { prisma } = require('../config/database');
const { serializeBookings, toDbBookingStatus } = require('../utils/booking');

const sanitizePagination = (pageValue, limitValue, maxLimit = 50) => {
  const page = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(limitValue, 10) || 10));
  return { page, limit };
};

// @desc    Get all drivers with filters
// @route   GET /api/drivers
// @access  Public
exports.getDrivers = async (req, res) => {
  try {
    const { city, licenseType, date } = req.query;
    const { page, limit } = sanitizePagination(req.query.page, req.query.limit);

    const where = {};
    if (licenseType) where.licenseType = licenseType;

    if (city) {
      // Prisma Postgres JSON filtering syntax for finding string property in a JSON field
      where.baseLocation = {
        path: ['city'],
        string_contains: String(city).trim()
      };
    }

    if (date) {
      const requestedDate = new Date(date);
      if (Number.isNaN(requestedDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date parameter' });
      }
      where.bookings = {
        none: {
          status: { in: ['confirmed', 'in_progress'] },
          startDate: { lte: requestedDate },
          endDate: { gte: requestedDate },
        }
      };
    }

    const total = await prisma.driver.count({ where });
    const drivers = await prisma.driver.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatar: true } }
      },
      orderBy: { averageRating: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      drivers,
    });
  } catch (err) {
    console.error('getDrivers error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single driver profile
// @route   GET /api/drivers/:id
// @access  Public
exports.getDriver = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } }
    });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const availability = await prisma.availability.findUnique({ where: { driverId: driver.id } });

    return res.status(200).json({ success: true, driver, availability });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update driver profile
// @route   PUT /api/drivers/profile
// @access  Private (driver only)
exports.updateProfile = async (req, res) => {
  try {
    const updateData = {};
    const allowedRootFields = ['bio', 'yearsExperience'];

    for (const field of allowedRootFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.baseLocation && typeof req.body.baseLocation === 'object') {
      updateData.baseLocation = {};
      const allowedBaseLocation = ['city', 'state', 'country'];
      for (const field of allowedBaseLocation) {
        if (Object.prototype.hasOwnProperty.call(req.body.baseLocation, field)) {
          updateData.baseLocation[field] = req.body.baseLocation[field];
        }
      }
    }

    if (req.file?.filename) {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await prisma.user.update({
        where: { id: req.user.id },
        data: { avatar: avatarUrl }
      });
    }

    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: updateData,
      include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } }
    });

    return res.status(200).json({ success: true, driver });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Driver profile not found' });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update driver availability schedule
// @route   PUT /api/drivers/availability
// @access  Private (driver only)
exports.updateAvailability = async (req, res) => {
  try {
    const { weeklySchedule, blockedDates, extraDates } = req.body;

    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const availability = await prisma.availability.upsert({
      where: { driverId: driver.id },
      update: {
        weeklySchedule: weeklySchedule || [],
        blockedDates: blockedDates || [],
        extraDates: extraDates || []
      },
      create: {
        driverId: driver.id,
        weeklySchedule: weeklySchedule || [],
        blockedDates: blockedDates || [],
        extraDates: extraDates || []
      }
    });

    return res.status(200).json({ success: true, availability });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get driver's own booking history
// @route   GET /api/drivers/my-bookings
// @access  Private (driver only)
exports.getMyBookings = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found' });

    const { status } = req.query;
    const { page, limit } = sanitizePagination(req.query.page, req.query.limit);
    const filter = { driverId: driver.id };
    if (status) filter.status = toDbBookingStatus(status);

    const total = await prisma.booking.count({ where: filter });
    const bookings = await prisma.booking.findMany({
      where: filter,
      include: {
        owner: {
          select: {
            companyName: true,
            user: { select: { id: true, name: true, email: true, phone: true } }
          }
        },
        lorry: { select: { registrationNumber: true, make: true, model: true, type: true } }
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), bookings: serializeBookings(bookings) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get driver analytics
// @route   GET /api/drivers/analytics
// @access  Private (driver only)
exports.getAnalytics = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const [totalBookings, completedBookings, upcomingBookings] = await Promise.all([
      prisma.booking.count({ where: { driverId: driver.id } }),
      prisma.booking.count({ where: { driverId: driver.id, status: 'completed' } }),
      prisma.booking.count({
        where: {
          driverId: driver.id,
          status: { in: ['confirmed', 'pending'] },
          startDate: { gte: new Date() },
        }
      })
    ]);

    const completedBookingRecords = await prisma.booking.findMany({
      where: { driverId: driver.id, status: 'completed' },
      select: { pickupLocation: true, dropoffLocation: true }
    });

    const routeCounts = {};
    completedBookingRecords.forEach(b => {
      const from = typeof b.pickupLocation === 'object' && b.pickupLocation ? b.pickupLocation.city : null;
      const to = typeof b.dropoffLocation === 'object' && b.dropoffLocation ? b.dropoffLocation.city : null;
      if (from && to) {
        const key = `${from}__${to}`;
        routeCounts[key] = (routeCounts[key] || 0) + 1;
      }
    });

    const routeStats = Object.keys(routeCounts).map(k => {
      const [from, to] = k.split('__');
      return { _id: { from, to }, count: routeCounts[k] };
    }).sort((a, b) => b.count - a.count).slice(0, 5);

    return res.status(200).json({
      success: true,
      analytics: {
        totalBookings,
        completedBookings,
        upcomingBookings,
        averageRating: driver.averageRating,
        totalTrips: driver.totalTrips,
        busiestRoutes: routeStats,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update driver's live location
// @route   PUT /api/drivers/live-location
// @access  Private (driver only)
exports.updateLiveLocation = async (req, res) => {
  try {
    const { lat, lng, speedKmh, heading, accuracyMeters } = req.body;
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng are required' });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Coordinates are out of range' });
    }

    const normalize = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: {
        isLiveTracking: true,
        liveLocation: {
          lat: latitude,
          lng: longitude,
          speedKmh: normalize(speedKmh),
          heading: normalize(heading),
          accuracyMeters: normalize(accuracyMeters),
          updatedAt: new Date().toISOString()
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Live location updated',
      liveLocation: driver.liveLocation,
      isLiveTracking: driver.isLiveTracking,
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Driver not found' });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Stop driver's live tracking
// @route   PUT /api/drivers/live-location/stop
// @access  Private (driver only)
exports.stopLiveLocation = async (req, res) => {
  try {
    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: { isLiveTracking: false }
    });

    return res.status(200).json({
      success: true,
      message: 'Live tracking stopped',
      isLiveTracking: false,
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Driver not found' });
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
