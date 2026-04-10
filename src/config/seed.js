require('dotenv').config();
const bcrypt = require('bcryptjs');
const { prisma, connectDB } = require('./database');

const seedAdmin = async () => {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in backend/.env');
  }

  await connectDB();
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: 'Super Admin',
        role: 'admin',
        isVerified: true,
        isActive: true,
        password: hashedPassword,
      },
    });

    console.log('Admin exists. Credentials refreshed from .env.');
    await prisma.$disconnect();
    process.exit(0);
  }

  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
      isActive: true,
    },
  });

  console.log('Admin seeded successfully.');
  await prisma.$disconnect();
  process.exit(0);
};

seedAdmin().catch((err) => {
  console.error(err);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
