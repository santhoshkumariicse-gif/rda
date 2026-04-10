const API_BOOKING_STATUS_MAP = {
  in_progress: 'in-progress',
  'in-progress': 'in-progress',
};

const DB_BOOKING_STATUS_MAP = {
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
};

const sanitizePagination = (pageValue, limitValue, maxLimit = 50) => {
  const page = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(limitValue, 10) || 10));
  return { page, limit };
};

const toDbBookingStatus = (status) => {
  if (typeof status !== 'string') return status;
  return DB_BOOKING_STATUS_MAP[status] || status;
};

const toApiBookingStatus = (status) => {
  if (typeof status !== 'string') return status;
  return API_BOOKING_STATUS_MAP[status] || status;
};

const serializeBooking = (booking) => {
  if (!booking) return booking;
  return { ...booking, status: toApiBookingStatus(booking.status) };
};

const serializeBookings = (bookings = []) => bookings.map(serializeBooking);

const calculateBookingTotalAmount = (startDate, endDate, agreedRate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  if (end < start) {
    return null;
  }

  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  const inclusiveDays = Math.floor((endUtc - startUtc) / msPerDay) + 1;
  const clampedDays = Math.max(1, inclusiveDays);

  return Math.max(0, clampedDays * Number(agreedRate));
};

const calculatePlatformFee = (totalAmount, commissionRate = 0.1) => {
  const amount = Number(totalAmount);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * commissionRate * 100) / 100;
};

module.exports = {
  calculateBookingTotalAmount,
  calculatePlatformFee,
  sanitizePagination,
  serializeBooking,
  serializeBookings,
  toApiBookingStatus,
  toDbBookingStatus,
};