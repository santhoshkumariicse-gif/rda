const { prisma } = require('../config/database');

const walletInclude = {
  transactions: {
    orderBy: { createdAt: 'desc' },
  },
};

const normalizeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const getOrCreateWallet = async (userId) => {
  const existingWallet = await prisma.wallet.findUnique({
    where: { userId },
    include: walletInclude,
  });

  if (existingWallet) {
    return existingWallet;
  }

  await prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      currency: 'INR',
    },
  });

  return prisma.wallet.findUnique({
    where: { userId },
    include: walletInclude,
  });
};

const createTransaction = async (tx, walletId, type, amount, description, balanceAfter, reference, referenceModel) => {
  await tx.transaction.create({
    data: {
      walletId,
      type,
      amount,
      description,
      reference: reference || null,
      referenceModel: referenceModel || null,
      balanceAfter,
    },
  });
};

// @desc    Get current user's wallet
// @route   GET /api/wallet
// @access  Private
exports.getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    res.json({
      success: true,
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        transactionCount: wallet.transactions.length,
      },
    });
  } catch (err) {
    console.error('getWallet error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get wallet transaction history
// @route   GET /api/wallet/transactions
// @access  Private
exports.getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const wallet = await getOrCreateWallet(req.user.id);
    const total = wallet.transactions.length;
    const transactions = wallet.transactions.slice(skip, skip + limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      transactions,
    });
  } catch (err) {
    console.error('getTransactions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Add funds to wallet (top-up)
// @route   POST /api/wallet/add-funds
// @access  Private
exports.addFunds = async (req, res) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    if (!amount || amount <= 0 || amount > 100000) {
      return res.status(400).json({ success: false, message: 'Amount must be between 1 and 100,000' });
    }

    const description = String(req.body.description || 'Wallet top-up').trim() || 'Wallet top-up';
    await getOrCreateWallet(req.user.id);

    const updatedWallet = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId: req.user.id },
        data: { balance: { increment: amount } },
      });

      await createTransaction(tx, wallet.id, 'credit', amount, description, wallet.balance);
      return wallet;
    });

    res.json({
      success: true,
      message: `₹${amount.toFixed(2)} added to wallet`,
      balance: updatedWallet.balance,
    });
  } catch (err) {
    console.error('addFunds error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Withdraw funds from wallet
// @route   POST /api/wallet/withdraw
// @access  Private
exports.withdraw = async (req, res) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid withdrawal amount' });
    }

    const description = String(req.body.description || 'Wallet withdrawal').trim() || 'Wallet withdrawal';
    await getOrCreateWallet(req.user.id);

    const updatedWallet = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (wallet.balance < amount) {
        const error = new Error('Insufficient wallet balance');
        error.statusCode = 400;
        throw error;
      }

      const nextWallet = await tx.wallet.update({
        where: { userId: req.user.id },
        data: { balance: { decrement: amount } },
      });

      await createTransaction(tx, nextWallet.id, 'debit', amount, description, nextWallet.balance);
      return nextWallet;
    });

    res.json({
      success: true,
      message: `₹${amount.toFixed(2)} withdrawn from wallet`,
      balance: updatedWallet.balance,
    });
  } catch (err) {
    console.error('withdraw error:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message || 'Server error' });
  }
};

// Helper – used internally by booking controller when a booking completes
exports.creditBookingEarnings = async (userId, amount, bookingId, description) => {
  const updatedWallet = await prisma.$transaction(async (tx) => {
    await tx.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0, currency: 'INR' },
      update: {},
    });

    const nextWallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    });

    await createTransaction(tx, nextWallet.id, 'credit', amount, description, nextWallet.balance, bookingId, 'Booking');
    return nextWallet;
  });

  return updatedWallet;
};

// Helper – debit on booking payment
exports.debitBookingPayment = async (userId, amount, bookingId, description) => {
  const updatedWallet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0, currency: 'INR' },
      update: {},
    });

    if (wallet.balance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    const nextWallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await createTransaction(tx, nextWallet.id, 'debit', amount, description, nextWallet.balance, bookingId, 'Booking');
    return nextWallet;
  });

  return updatedWallet;
};