const { prisma } = require('../config/database');
const { serializeBookings, toDbBookingStatus } = require('../utils/booking');
const notificationService = require('../services/notificationService');

const sanitizePagination = (pageValue, limitValue, maxLimit = 50) => {
  const page = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(limitValue, 10) || 10));
  return { page, limit };
};

const pickLorryFields = (source = {}) => {
  const allowedFields = ['registrationNumber', 'make', 'model', 'year', 'type', 'requiredLicense', 'maxLoadTons', 'notes'];
  const payload = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      payload[field] = source[field];
    }
  }
  return payload;
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCoordinates = (point) => {
  if (!point || typeof point !== 'object') return null;
  const lat = toFiniteNumber(point.lat);
  const lng = toFiniteNumber(point.lng);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
};

const toRadians = (value) => (value * Math.PI) / 180;
const haversineKm = (from, to) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

// @desc    Update lorry owner profile
// @route   PUT /api/owners/profile
// @access  Private (owner only)
exports.updateProfile = async (req, res) => {
  try {
    const updateData = {};
    const allowedRootFields = ['companyName', 'companyRegistrationNo', 'vatNumber'];

    for (const field of allowedRootFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.address && typeof req.body.address === 'object') {
      updateData.address = {};
      const allowedAddressFields = ['street', 'city', 'state', 'postcode', 'country'];
      for (const field of allowedAddressFields) {
        if (Object.prototype.hasOwnProperty.call(req.body.address, field)) {
          updateData.address[field] = req.body.address[field];
        }
      }
    }

    if (req.body.contactPerson && typeof req.body.contactPerson === 'object') {
      updateData.contactPerson = {};
      const allowedContactFields = ['name', 'phone', 'email'];
      for (const field of allowedContactFields) {
        if (Object.prototype.hasOwnProperty.call(req.body.contactPerson, field)) {
          updateData.contactPerson[field] = req.body.contactPerson[field];
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

    const owner = await prisma.lorryOwner.update({
      where: { userId: req.user.id },
      data: updateData,
      include: { user: { select: { id: true, name: true, email: true, phone: true } } }
    });

    return res.status(200).json({ success: true, owner });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Owner profile not found' });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Add a lorry
// @route   POST /api/owners/lorries
// @access  Private (owner only)
exports.addLorry = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const lorryData = pickLorryFields(req.body);
    const lorry = await prisma.lorry.create({ data: { ...lorryData, ownerId: ownerProfile.id } });

    return res.status(201).json({ success: true, lorry });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Registration number already exists' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get owner's lorries
// @route   GET /api/owners/lorries
// @access  Private (owner only)
exports.getMyLorries = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const lorries = await prisma.lorry.findMany({ where: { ownerId: ownerProfile.id, isActive: true } });
    return res.status(200).json({ success: true, lorries });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update a lorry
// @route   PUT /api/owners/lorries/:lorryId
// @access  Private (owner only)
exports.updateLorry = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const checkLorry = await prisma.lorry.findFirst({ where: { id: req.params.lorryId, ownerId: ownerProfile.id } });
    if (!checkLorry) return res.status(404).json({ success: false, message: 'Lorry not found' });

    const updateData = pickLorryFields(req.body);
    const lorry = await prisma.lorry.update({
      where: { id: req.params.lorryId },
      data: updateData
    });

    return res.status(200).json({ success: true, lorry });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Registration number already exists' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete (deactivate) a lorry
// @route   DELETE /api/owners/lorries/:lorryId
// @access  Private (owner only)
exports.deleteLorry = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner not found' });

    const checkLorry = await prisma.lorry.findFirst({ where: { id: req.params.lorryId, ownerId: ownerProfile.id } });
    if (!checkLorry) return res.status(404).json({ success: false, message: 'Lorry not found' });

    await prisma.lorry.update({
      where: { id: req.params.lorryId },
      data: { isActive: false }
    });

    return res.status(200).json({ success: true, message: 'Lorry removed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get owner's booking history
// @route   GET /api/owners/my-bookings
// @access  Private (owner only)
exports.getMyBookings = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const { status } = req.query;
    const { page, limit } = sanitizePagination(req.query.page, req.query.limit);
    const filter = { ownerId: ownerProfile.id };
    if (status) filter.status = toDbBookingStatus(status);

    const total = await prisma.booking.count({ where: filter });
    const bookings = await prisma.booking.findMany({
      where: filter,
      include: {
        driver: { include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } } },
        lorry: { select: { registrationNumber: true, make: true, model: true, type: true } }
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit), bookings: serializeBookings(bookings) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get owner analytics
// @route   GET /api/owners/analytics
// @access  Private (owner only)
exports.getAnalytics = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner not found' });

    const [totalBookings, completedBookings, pendingBookings] = await Promise.all([
      prisma.booking.count({ where: { ownerId: ownerProfile.id } }),
      prisma.booking.count({ where: { ownerId: ownerProfile.id, status: 'completed' } }),
      prisma.booking.count({ where: { ownerId: ownerProfile.id, status: 'pending' } })
    ]);

    const allCompleted = await prisma.booking.findMany({
      where: { ownerId: ownerProfile.id, status: 'completed' },
      select: { startDate: true, totalAmount: true }
    });
    
    const spendMap = {};
    allCompleted.forEach(b => {
      if (!b.startDate) return;
      const d = new Date(b.startDate);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if(!spendMap[key]) spendMap[key] = { _id: { year: d.getFullYear(), month: d.getMonth() + 1 }, totalSpend: 0, count: 0 };
      spendMap[key].totalSpend += (b.totalAmount || 0);
      spendMap[key].count += 1;
    });
    
    const spendByMonth = Object.values(spendMap).sort((a,b) => {
      if(a._id.year !== b._id.year) return b._id.year - a._id.year;
      return b._id.month - a._id.month;
    }).slice(0, 6);

    return res.status(200).json({
      success: true,
      analytics: { totalBookings, completedBookings, pendingBookings, spendByMonth },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Post a load and notify nearby drivers
// @route   POST /api/owners/loads
// @access  Private (owner only)
exports.postLoad = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id }, include: { user: { select: { name: true, email: true } } } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const { goodsType, from, to, pay, ownerCoordinates, fromCoordinates, radiusKm } = req.body;
    if (!goodsType || !from || !to || !pay) {
      return res.status(400).json({
        success: false,
        message: 'goodsType, from, to and pay are required',
      });
    }

    const ownerCity = ownerProfile.address && typeof ownerProfile.address === 'object' && ownerProfile.address.city ? ownerProfile.address.city.trim() : '';
    const fromCity = String(from).trim();
    const locationTerms = [ownerCity, fromCity].filter(Boolean);
    const normalizedLocationTerms = locationTerms.map((city) => city.toLowerCase());

    const rawRadius = toFiniteNumber(radiusKm);
    const searchRadiusKm = rawRadius && rawRadius > 0 ? Math.min(rawRadius, 200) : 25;
    const referenceCoordinates = getCoordinates(ownerCoordinates) || getCoordinates(fromCoordinates);

    const availableDrivers = await prisma.driver.findMany({
      where: { isAvailable: true },
      include: { user: { select: { name: true, email: true } } },
      take: 2000
    });

    let skippedWithoutCoordinates = 0;
    const nearbyDrivers = availableDrivers.filter((driver) => {
      if (!driver.baseLocation || typeof driver.baseLocation !== 'object') {
        skippedWithoutCoordinates += 1;
        return false;
      }
      const driverCoords = getCoordinates(driver.baseLocation.coordinates);
      const driverCity = String(driver.baseLocation.city || '').trim().toLowerCase();
      const cityMatch = normalizedLocationTerms.includes(driverCity);
      const hasMinimumLocationProfile = Boolean(driverCoords);

      if (!hasMinimumLocationProfile) {
        skippedWithoutCoordinates += 1;
        return false;
      }

      if (!referenceCoordinates) return cityMatch;

      const distanceKm = haversineKm(referenceCoordinates, driverCoords);
      return distanceKm <= searchRadiusKm || cityMatch;
    });

    const postedLoad = {
      id: Date.now(),
      goodsType,
      from: fromCity,
      to: String(to).trim(),
      pay: Number(pay),
      postedAt: new Date(),
      radiusKm: searchRadiusKm,
      referenceCoordinates,
      owner: {
        name: ownerProfile.user?.name,
        email: ownerProfile.user?.email,
        companyName: ownerProfile.companyName,
        city: ownerCity,
      },
    };

    // Fire-and-forget so load posting remains fast for the owner UI.
    notificationService
      .sendLoadPostedToNearbyDrivers({ owner: ownerProfile, load: postedLoad, drivers: nearbyDrivers })
      .catch(console.error);

    return res.status(201).json({
      success: true,
      message: `Load posted. ${nearbyDrivers.length} nearby driver(s) notified.`,
      postedLoad,
      notifiedDrivers: nearbyDrivers.length,
      skippedWithoutCoordinates,
      radiusKm: searchRadiusKm,
    });
  } catch (err) {
    console.error('postLoad error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get live tracking data for owner's active bookings
// @route   GET /api/owners/live-tracking
// @access  Private (owner only)
exports.getLiveTracking = async (req, res) => {
  try {
    const ownerProfile = await prisma.lorryOwner.findUnique({ where: { userId: req.user.id } });
    if (!ownerProfile) return res.status(404).json({ success: false, message: 'Owner profile not found' });

    const activeBookings = await prisma.booking.findMany({
      where: {
        ownerId: ownerProfile.id,
        status: { in: ['confirmed', 'in_progress'] },
      },
      include: {
        driver: { include: { user: { select: { name: true, phone: true, avatar: true } } } },
        lorry: { select: { registrationNumber: true, make: true, model: true } }
      },
      orderBy: { startDate: 'desc' }
    });

    const tracked = serializeBookings(activeBookings)
      .filter((booking) => {
        if (!booking.driver || !booking.driver.liveLocation || typeof booking.driver.liveLocation !== 'object') return false;
        const lat = Number(booking.driver.liveLocation.lat);
        const lng = Number(booking.driver.liveLocation.lng);
        return Number.isFinite(lat) && Number.isFinite(lng);
      })
      .map((booking) => {
        const updatedAtStr = booking.driver.liveLocation.updatedAt;
        const updatedAt = updatedAtStr ? new Date(updatedAtStr) : null;
        const ageSeconds = updatedAt ? Math.floor((Date.now() - updatedAt.getTime()) / 1000) : null;

        return {
          bookingId: booking.id,
          status: booking.status,
          driver: {
            id: booking.driver.id,
            name: booking.driver.user?.name,
            phone: booking.driver.user?.phone,
            avatar: booking.driver.user?.avatar,
            isLiveTracking: booking.driver.isLiveTracking,
          },
          lorry: booking.lorry,
          route: {
            from: booking.pickupLocation?.city,
            to: booking.dropoffLocation?.city,
          },
          location: booking.driver.liveLocation,
          lastUpdateAgeSeconds: ageSeconds,
          isStale: ageSeconds !== null ? ageSeconds > 120 : true,
        };
      });

    return res.status(200).json({
      success: true,
      totalActiveBookings: activeBookings.length,
      trackedDrivers: tracked,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
