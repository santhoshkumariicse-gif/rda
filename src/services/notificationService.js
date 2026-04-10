const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send an email using Nodemailer.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML email body
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.SMTP_USER) {
    console.warn('[Notification] SMTP not configured – skipping email to', to);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"LorryBook" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Notification] Failed to send email:', err.message);
  }
};

/**
 * Send booking confirmation emails to both driver and owner.
 * @param {object} booking - Populated Booking document
 */
exports.sendBookingConfirmation = async (booking) => {
  try {
    const startDate = new Date(booking.startDate).toLocaleDateString('en-GB');
    const endDate = new Date(booking.endDate).toLocaleDateString('en-GB');
    const ownerName = booking.owner?.user?.name || 'Owner';
    const ownerEmail = booking.owner?.user?.email;
    const driverName = booking.driver?.user?.name || 'Driver';
    const driverEmail = booking.driver?.user?.email;
    const lorryInfo = booking.lorry
      ? `${booking.lorry.make} ${booking.lorry.model} (${booking.lorry.registrationNumber})`
      : 'N/A';

    const ownerHtml = `
      <h2>Booking Confirmation</h2>
      <p>Dear ${ownerName},</p>
      <p>Your booking has been successfully created. Details below:</p>
      <table border="0" cellpadding="6">
        <tr><td><strong>Driver:</strong></td><td>${driverName}</td></tr>
        <tr><td><strong>Lorry:</strong></td><td>${lorryInfo}</td></tr>
        <tr><td><strong>Start Date:</strong></td><td>${startDate}</td></tr>
        <tr><td><strong>End Date:</strong></td><td>${endDate}</td></tr>
        <tr><td><strong>Pickup:</strong></td><td>${booking.pickupLocation?.city}</td></tr>
        <tr><td><strong>Dropoff:</strong></td><td>${booking.dropoffLocation?.city}</td></tr>
        <tr><td><strong>Total Amount:</strong></td><td>₹${(booking.totalAmount / 100).toFixed(2)}</td></tr>
      </table>
      <p>Thank you for using LorryBook!</p>
    `;

    const driverHtml = `
      <h2>New Booking Request</h2>
      <p>Dear ${driverName},</p>
      <p>You have received a new booking request. Details below:</p>
      <table border="0" cellpadding="6">
        <tr><td><strong>Company:</strong></td><td>${booking.owner?.companyName || ownerName}</td></tr>
        <tr><td><strong>Lorry:</strong></td><td>${lorryInfo}</td></tr>
        <tr><td><strong>Start Date:</strong></td><td>${startDate}</td></tr>
        <tr><td><strong>End Date:</strong></td><td>${endDate}</td></tr>
        <tr><td><strong>Pickup:</strong></td><td>${booking.pickupLocation?.city}</td></tr>
        <tr><td><strong>Dropoff:</strong></td><td>${booking.dropoffLocation?.city}</td></tr>
        <tr><td><strong>Daily Rate:</strong></td><td>₹${(booking.agreedRate / 100).toFixed(2)}</td></tr>
      </table>
      <p>Please log in to confirm or decline this booking.</p>
    `;

    const promises = [];
    if (ownerEmail) promises.push(sendEmail(ownerEmail, 'Your LorryBook Booking Confirmation', ownerHtml));
    if (driverEmail) promises.push(sendEmail(driverEmail, 'New Booking Request – LorryBook', driverHtml));

    await Promise.all(promises);
  } catch (err) {
    console.error('[Notification] Failed to send booking confirmation:', err.message);
  }
};

/**
 * Send booking cancellation notification.
 */
exports.sendCancellationNotice = async (booking) => {
  try {
    const ownerEmail = booking.owner?.user?.email;
    const driverEmail = booking.driver?.user?.email;
    const subject = 'Booking Cancellation – LorryBook';
    const bookingRef = booking.id || booking._id || 'unknown';
    const html = `<p>Booking #${bookingRef} has been cancelled. Reason: ${booking.cancellationReason}</p>`;

    const promises = [];
    if (ownerEmail) promises.push(sendEmail(ownerEmail, subject, html));
    if (driverEmail) promises.push(sendEmail(driverEmail, subject, html));
    await Promise.all(promises);
  } catch (err) {
    console.error('[Notification] Failed to send cancellation notice:', err.message);
  }
};

/**
 * Notify available nearby drivers about a newly posted load.
 */
exports.sendLoadPostedToNearbyDrivers = async ({ owner, load, drivers = [] }) => {
  try {
    if (!Array.isArray(drivers) || drivers.length === 0) return;

    const ownerName = owner?.companyName || owner?.user?.name || 'Lorry Owner';
    const ownerCity = owner?.address?.city || owner?.city || 'your area';
    const payAmount = Number(load?.pay || 0);
    const formattedPay = Number.isFinite(payAmount)
      ? payAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
      : load?.pay;

    const emails = drivers
      .map((driver) => ({
        name: driver?.user?.name || 'Driver',
        email: driver?.user?.email,
      }))
      .filter((d) => Boolean(d.email));

    const sendJobs = emails.map(({ name, email }) => {
      const html = `
        <h2>New Load Near You</h2>
        <p>Hi ${name},</p>
        <p>A new load has been posted near <strong>${ownerCity}</strong>.</p>
        <table border="0" cellpadding="6">
          <tr><td><strong>Owner:</strong></td><td>${ownerName}</td></tr>
          <tr><td><strong>Goods Type:</strong></td><td>${load.goodsType}</td></tr>
          <tr><td><strong>From:</strong></td><td>${load.from}</td></tr>
          <tr><td><strong>To:</strong></td><td>${load.to}</td></tr>
          <tr><td><strong>Pay:</strong></td><td>₹${formattedPay}</td></tr>
        </table>
        <p>Log in to LorryBook to view and respond quickly.</p>
      `;

      return sendEmail(email, 'New Nearby Load Posted - LorryBook', html);
    });

    await Promise.all(sendJobs);
  } catch (err) {
    console.error('[Notification] Failed to send nearby load notification:', err.message);
  }
};

/**
 * Send password reset email.
 */
exports.sendPasswordResetEmail = async (email, name, resetUrl) => {
  const html = `
    <h2>Password Reset Request</h2>
    <p>Hi ${name || 'User'},</p>
    <p>We received a request to reset your password for your LorryBook account.</p>
    <p>
      <a href="${resetUrl}" target="_blank" rel="noopener noreferrer">Click here to reset your password</a>
    </p>
    <p>This link expires in 15 minutes. If you did not request this, please ignore this email.</p>
  `;

  await sendEmail(email, 'Reset Your LorryBook Password', html);
};

/**
 * Send email verification link.
 */
exports.sendVerificationEmail = async (email, name, verifyUrl) => {
  const html = `
    <h2>Verify Your Email Address</h2>
    <p>Hi ${name || 'User'},</p>
    <p>Thank you for registering on LorryBook!</p>
    <p>Please click the link below to verify your email address:</p>
    <p>
      <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">Verify Email</a>
    </p>
    <p>If you did not create an account, please ignore this email.</p>
  `;

  await sendEmail(email, 'Verify your email address - LorryBook', html);
};
