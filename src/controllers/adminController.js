const { prisma } = require('../config/database');
const { sanitizePagination, serializeBookings, toDbBookingStatus } = require('../utils/booking');

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  avatar: true,
  createdAt: true,
  updatedAt: true,
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private (admin only)
exports.getDashboardStats = async (_req, res) => {
  try {
    const [totalUsers, totalDrivers, totalOwners, totalBookings, activeBookings, completedBookings, cancelledBookings, recentBookings, topDrivers] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'admin' } } }),
      prisma.user.count({ where: { role: 'driver' } }),
      prisma.user.count({ where: { role: 'owner' } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: { in: ['confirmed', 'in_progress'] } } }),
      prisma.booking.count({ where: { status: 'completed' } }),
      prisma.booking.count({ where: { status: 'cancelled' } }),
      prisma.booking.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          owner: { include: { user: { select: { name: true } } } },
          driver: { include: { user: { select: { name: true } } } },
          lorry: true,
        },
      }),
      prisma.driver.findMany({
        orderBy: [{ totalTrips: 'desc' }, { averageRating: 'desc' }],
        take: 5,
        include: { user: { select: { name: true, email: true, avatar: true } } },
      }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalDrivers,
        totalOwners,
        totalBookings,
        activeBookings,
        completedBookings,
        cancelledBookings,
        recentBookings: serializeBookings(recentBookings),
        topDrivers,
      },
    });
  } catch (err) {
    console.error('admin stats error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const { page, limit } = sanitizePagination(req.query.page, req.query.limit, 100);
    const filter = {};

    if (role && role !== 'all') {
      filter.role = role;
    }

    if (search) {
      filter.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where: filter }),
      prisma.user.findMany({
        where: filter,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.status(200).json({ success: true, total, users });
  } catch (err) {
    console.error('admin users error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Toggle user active status (ban/unban)
// @route   PUT /api/admin/users/:userId/toggle-status
// @access  Private (admin only)
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: userSelect });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const updatedUser = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isActive: !user.isActive },
      select: userSelect,
    });

    return res.status(200).json({
      success: true,
      message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
      user: { _id: updatedUser.id, name: updatedUser.name, isActive: updatedUser.isActive },
    });
  } catch (err) {
    console.error('admin toggle status error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all bookings (admin view)
// @route   GET /api/admin/bookings
// @access  Private (admin only)
exports.getAllBookings = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit } = sanitizePagination(req.query.page, req.query.limit, 100);
    const filter = {};

    if (status) {
      filter.status = toDbBookingStatus(status);
    }

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where: filter }),
      prisma.booking.findMany({
        where: filter,
        include: {
          owner: { include: { user: { select: { name: true, email: true } } } },
          driver: { include: { user: { select: { name: true, email: true } } } },
          lorry: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.status(200).json({ success: true, total, bookings: serializeBookings(bookings) });
  } catch (err) {
    console.error('admin bookings error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get booking analytics (busiest routes, bookings per driver per month)
// @route   GET /api/admin/analytics
// @access  Private (admin only)
exports.getAnalytics = async (_req, res) => {
  try {
    const [completedBookings, bookingsForDrivers, bookingsByMonth] = await Promise.all([
      prisma.booking.findMany({
        where: { status: 'completed' },
        select: { pickupLocation: true, dropoffLocation: true },
      }),
      prisma.booking.findMany({
        select: {
          driverId: true,
          status: true,
          driver: { select: { id: true, user: { select: { name: true } } } },
        },
      }),
      prisma.booking.findMany({ select: { createdAt: true } }),
    ]);

    const routeCounts = {};
    completedBookings.forEach((booking) => {
      const from = booking.pickupLocation?.city;
      const to = booking.dropoffLocation?.city;
      if (!from || !to) return;

      const key = `${from}__${to}`;
      routeCounts[key] = (routeCounts[key] || 0) + 1;
    });

    const busiestRoutes = Object.entries(routeCounts)
      .map(([key, count]) => {
        const [from, to] = key.split('__');
        return { _id: { from, to }, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const driverMap = new Map();
    bookingsForDrivers.forEach((booking) => {
      const key = booking.driverId;
      const entry = driverMap.get(key) || {
        _id: key,
        driverName: booking.driver?.user?.name || 'Driver',
        totalBookings: 0,
        completedBookings: 0,
      };

      entry.totalBookings += 1;
      if (booking.status === 'completed') {
        entry.completedBookings += 1;
      }

      driverMap.set(key, entry);
    });

    const bookingsPerDriver = Array.from(driverMap.values())
      .sort((a, b) => b.totalBookings - a.totalBookings)
      .slice(0, 10);

    const monthCounts = new Map();
    bookingsByMonth.forEach((booking) => {
      const created = new Date(booking.createdAt);
      const key = `${created.getFullYear()}-${created.getMonth() + 1}`;
      const current = monthCounts.get(key) || { _id: { year: created.getFullYear(), month: created.getMonth() + 1 }, count: 0 };
      current.count += 1;
      monthCounts.set(key, current);
    });

    const bookingsByMonthResponse = Array.from(monthCounts.values())
      .sort((a, b) => {
        if (a._id.year !== b._id.year) {
          return b._id.year - a._id.year;
        }
        return b._id.month - a._id.month;
      })
      .slice(0, 12);

    return res.status(200).json({ success: true, analytics: { busiestRoutes, bookingsPerDriver, bookingsByMonth: bookingsByMonthResponse } });
  } catch (err) {
    console.error('admin analytics error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get unrestricted full app data for admin
// @route   GET /api/admin/all-data
// @access  Private (admin only)
exports.getAllData = async (_req, res) => {
  try {
    const [users, drivers, owners, lorries, bookings, availabilities, wallets] = await Promise.all([
      prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } }),
      prisma.driver.findMany({
        include: { user: { select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, avatar: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lorryOwner.findMany({
        include: { user: { select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, avatar: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lorry.findMany({
        include: { owner: { include: { user: { select: { name: true, email: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.findMany({
        include: {
          owner: { include: { user: { select: { name: true, email: true, phone: true } } } },
          driver: { include: { user: { select: { name: true, email: true, phone: true } } } },
          lorry: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.availability.findMany({
        include: { driver: { include: { user: { select: { name: true, email: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet.findMany({
        include: {
          user: { select: { name: true, email: true, phone: true, role: true } },
          transactions: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.status(200).json({
      success: true,
      generatedAt: new Date(),
      counts: {
        users: users.length,
        drivers: drivers.length,
        owners: owners.length,
        lorries: lorries.length,
        bookings: bookings.length,
        availabilities: availabilities.length,
        wallets: wallets.length,
      },
      data: {
        users,
        drivers,
        owners,
        lorries,
        bookings: serializeBookings(bookings),
        availabilities,
        wallets,
      },
    });
  } catch (err) {
    console.error('admin all-data error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};