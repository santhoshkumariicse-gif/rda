const { prisma } = require('../config/database');
const notificationService = require('../services/notificationService');
const {
  calculateBookingTotalAmount,
  calculatePlatformFee,
  serializeBooking,
  toApiBookingStatus,
} = require('../utils/booking');
const socketService = require('../services/socketService');

const bookingInclude = {
  owner: {
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  driver: {
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
    },
  },
  lorry: true,
};

const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const findOwnerProfile = (userId) => prisma.lorryOwner.findUnique({ where: { userId } });
const findDriverProfile = (userId) => prisma.driver.findUnique({ where: { userId } });

const loadBookingWithRelations = (bookingId) =>
  prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private (owner only)
exports.createBooking = async (req, res) => {
  try {
    const ownerProfile = await findOwnerProfile(req.user.id);
    if (!ownerProfile) {
      return res.status(403).json({ success: false, message: 'Only lorry owners can create bookings' });
    }

    const { driverId, lorryId, startDate, endDate, pickupLocation, dropoffLocation, cargo, agreedRate, currency = 'INR' } = req.body;

    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate);
    const sanitizedAgreedRate = Number(agreedRate);
    const totalAmount = calculateBookingTotalAmount(parsedStartDate, parsedEndDate, sanitizedAgreedRate);
    const platformFee = calculatePlatformFee(totalAmount);
    const payoutAmount = totalAmount - platformFee;

    if (!parsedStartDate || !parsedEndDate) {
      return res.status(400).json({ success: false, message: 'Invalid startDate or endDate' });
    }

    if (!Number.isFinite(sanitizedAgreedRate) || sanitizedAgreedRate <= 0) {
      return res.status(400).json({ success: false, message: 'agreedRate must be a positive number' });
    }

    if (totalAmount === null) {
      return res.status(400).json({ success: false, message: 'Invalid booking dates' });
    }

    const lorry = await prisma.lorry.findFirst({
      where: { id: lorryId, ownerId: ownerProfile.id, isActive: true },
    });
    if (!lorry) {
      return res.status(404).json({ success: false, message: 'Lorry not found or does not belong to you' });
    }

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const conflict = await prisma.booking.findFirst({
      where: {
        driverId,
        status: { in: ['pending', 'confirmed', 'in_progress'] },
        startDate: { lt: parsedEndDate },
        endDate: { gt: parsedStartDate },
      },
    });

    if (conflict) {
      return res.status(409).json({ success: false, message: 'Driver is not available for the selected dates' });
    }

    const booking = await prisma.booking.create({
      data: {
        ownerId: ownerProfile.id,
        driverId,
        lorryId,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        pickupLocation,
        dropoffLocation,
        cargo: cargo || undefined,
        agreedRate: sanitizedAgreedRate,
        totalAmount,
        platformFee,
        payoutAmount,
        currency: String(currency || 'INR').toUpperCase(),
        status: 'pending',
      },
      include: bookingInclude,
    });

    notificationService.sendBookingConfirmation(serializeBooking(booking)).catch((err) => {
      console.error('Failed to send booking confirmation:', err.message);
    });

    // Notify driver in real-time
    socketService.notifyUser(booking.driver?.user?.id, 'new_booking', serializeBooking(booking));

    return res.status(201).json({ success: true, booking: serializeBooking(booking) });
  } catch (err) {
    console.error('createBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get a single booking by ID
// @route   GET /api/bookings/:id
// @access  Private (owner, driver, or admin)
exports.getBooking = async (req, res) => {
  try {
    const booking = await loadBookingWithRelations(req.params.id);

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isOwner = booking.owner?.userId === req.user.id;
    const isDriver = booking.driver?.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.status(200).json({ success: true, booking: serializeBooking(booking) });
  } catch (err) {
    console.error('getBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Confirm a booking (driver accepts)
// @route   PUT /api/bookings/:id/confirm
// @access  Private (driver only)
exports.confirmBooking = async (req, res) => {
  try {
    const driverProfile = await findDriverProfile(req.user.id);
    if (!driverProfile) return res.status(403).json({ success: false, message: 'Only drivers can confirm bookings' });

    const updated = await prisma.booking.updateMany({
      where: { id: req.params.id, driverId: driverProfile.id, status: 'pending' },
      data: { status: 'confirmed' },
    });

    if (updated.count === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or cannot be confirmed' });
    }

    const booking = await loadBookingWithRelations(req.params.id);

    // Notify owner in real-time
    socketService.notifyUser(booking.owner?.user?.id, 'booking_confirmed', serializeBooking(booking));

    return res.status(200).json({ success: true, booking: serializeBooking(booking) });
  } catch (err) {
    console.error('confirmBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Start a confirmed booking (driver marks in-progress)
// @route   PUT /api/bookings/:id/start
// @access  Private (driver only)
exports.startBooking = async (req, res) => {
  try {
    const driverProfile = await findDriverProfile(req.user.id);
    if (!driverProfile) return res.status(403).json({ success: false, message: 'Only drivers can start bookings' });

    const updated = await prisma.booking.updateMany({
      where: { id: req.params.id, driverId: driverProfile.id, status: 'confirmed' },
      data: { status: 'in_progress' },
    });

    if (updated.count === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or not in confirmed state' });
    }

    const booking = await loadBookingWithRelations(req.params.id);
    return res.status(200).json({ success: true, booking: serializeBooking(booking) });
  } catch (err) {
    console.error('startBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Cancel a booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private (owner or driver)
exports.cancelBooking = async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await loadBookingWithRelations(req.params.id);

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${toApiBookingStatus(booking.status)} booking` });
    }

    const ownerProfile = await findOwnerProfile(req.user.id);
    const driverProfile = await findDriverProfile(req.user.id);

    const isOwner = ownerProfile && booking.ownerId === ownerProfile.id;
    const isDriver = driverProfile && booking.driverId === driverProfile.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        status: 'cancelled',
        cancellationReason: reason || 'No reason provided',
        cancelledBy: req.user.id,
      },
      include: bookingInclude,
    });

    notificationService.sendCancellationNotice(serializeBooking(updatedBooking)).catch((err) => {
      console.error('Failed to send cancellation notice:', err.message);
    });

    // Notify other party in real-time
    const otherUserId = isOwner ? updatedBooking.driver?.user?.id : updatedBooking.owner?.user?.id;
    socketService.notifyUser(otherUserId, 'booking_cancelled', serializeBooking(updatedBooking));

    return res.status(200).json({ success: true, booking: serializeBooking(updatedBooking) });
  } catch (err) {
    console.error('cancelBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark a booking as completed
// @route   PUT /api/bookings/:id/complete
// @access  Private (driver only)
exports.completeBooking = async (req, res) => {
  try {
    const driverProfile = await findDriverProfile(req.user.id);
    if (!driverProfile) return res.status(403).json({ success: false, message: 'Only drivers can complete bookings' });

    const updated = await prisma.booking.updateMany({
      where: { id: req.params.id, driverId: driverProfile.id, status: 'in_progress' },
      data: { status: 'completed' },
    });

    if (updated.count === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found or not in progress' });
    }

    await prisma.driver.update({
      where: { id: driverProfile.id },
      data: { totalTrips: { increment: 1 } },
    });

    const booking = await loadBookingWithRelations(req.params.id);
    return res.status(200).json({ success: true, booking: serializeBooking(booking) });
  } catch (err) {
    console.error('completeBooking error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Submit a review for a completed booking
// @route   POST /api/bookings/:id/review
// @access  Private (owner only)
exports.submitReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const ownerProfile = await findOwnerProfile(req.user.id);

    if (!ownerProfile) return res.status(403).json({ success: false, message: 'Only owners can leave reviews' });

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: bookingInclude,
    });

    if (!booking || booking.ownerId !== ownerProfile.id || booking.status !== 'completed' || booking.review) {
      return res.status(404).json({ success: false, message: 'Booking not found, not completed, or already reviewed' });
    }

    const reviewRating = Number(rating);
    if (!Number.isFinite(reviewRating) || reviewRating < 1 || reviewRating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be between 1 and 5' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        review: {
          rating: reviewRating,
          comment: comment || '',
          createdAt: new Date(),
        },
      },
      include: bookingInclude,
    });

    const reviewedBookings = await prisma.booking.findMany({
      where: {
        driverId: booking.driverId,
        review: { not: null },
      },
      select: { review: true },
    });

    const ratings = reviewedBookings
      .map((entry) => Number(entry.review?.rating))
      .filter((value) => Number.isFinite(value));

    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / totalRatings) * 10) / 10
      : 0;

    await prisma.driver.update({
      where: { id: booking.driverId },
      data: {
        averageRating,
        totalRatings,
      },
    });

    return res.status(200).json({ success: true, booking: serializeBooking(updatedBooking) });
  } catch (err) {
    console.error('submitReview error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};