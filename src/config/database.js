const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log(`Prisma database connected successfully.`);
  } catch (err) {
    console.error('Prisma connection error:', err.message);
    process.exit(1);
  }
};

module.exports = { connectDB, prisma };
