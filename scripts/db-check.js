const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function waitForDb(retries = 10, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting DB connection (Try ${i + 1}/${retries})...`);
      await prisma.$connect();
      console.log('Database is awake and ready!');
      await prisma.$disconnect();
      return; // Success
    } catch (e) {
      console.log('Database unavailable, waiting...');
      await new Promise(res => setTimeout(res, delay));
    }
  }
  console.error('Database timed out.');
  process.exit(1);
}

waitForDb();
