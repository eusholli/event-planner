const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const connectionString = `${process.env.POSTGRES_PRISMA_URL}`;

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

let cleanedConnectionString = connectionString;
if (!isLocal) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    cleanedConnectionString = url.toString();
  } catch (error) {
    console.error('Failed to parse connection string:', error);
  }
}

const pool = new Pool({
  connectionString: cleanedConnectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
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
