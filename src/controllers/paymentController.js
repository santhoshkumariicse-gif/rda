const { prisma } = require('../config/database');

const Razorpay = require('razorpay');

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

exports.createCheckoutSession = async (req, res, next) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ success: false, message: 'Razorpay is not configured' });
    }

    const { amount, bookingId, currency = 'INR' } = req.body;
    let amountToCharge = Number(amount);

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { owner: { select: { userId: true } } },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      if (req.user?.role !== 'admin' && booking.owner?.userId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You are not allowed to pay for this booking' });
      }

      amountToCharge = Number(booking.totalAmount ?? booking.agreedRate);
    }

    if (!Number.isFinite(amountToCharge) || amountToCharge <= 0) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round(amountToCharge * 100),
      currency: String(currency || 'INR').toUpperCase(),
      description: `Lorry Booking Payment${bookingId ? ` ID: ${bookingId}` : ''}`,
      customer: {
        email: req.user?.email || undefined,
      },
      notify: {
        sms: false,
        email: !!req.user?.email,
      },
      reminder_enable: false,
      callback_url: `${clientUrl}/payment-success`,
      callback_method: 'get',
      notes: {
        bookingId: bookingId ? bookingId.toString() : 'N/A',
        userId: req.user ? req.user.id.toString() : 'N/A',
      },
    });

    res.status(200).json({
      success: true,
      url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error) {
    console.error('Razorpay error:', error);
    next(error);
  }
};