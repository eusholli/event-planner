const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const connectionString = `${process.env.POSTGRES_PRISMA_URL}`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

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
