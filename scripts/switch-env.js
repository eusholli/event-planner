const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envType = process.argv[2]; // 'main' or 'multi'

if (!envType || (envType !== 'main' && envType !== 'multi')) {
    console.error('Please specify environment: "main" or "multi"');
    process.exit(1);
}

const rootDir = process.cwd();
const sourceEnv = path.join(rootDir, `.env.${envType}`);
const targetEnv = path.join(rootDir, '.env');

if (!fs.existsSync(sourceEnv)) {
    console.error(`Error: Source environment file ${sourceEnv} not found.`);
    process.exit(1);
}

console.log(`\n🔄 Switching to ${envType.toUpperCase()} environment...`);

try {
    // 1. Copy the .env file
    fs.copyFileSync(sourceEnv, targetEnv);
    console.log(`✅ Copied .env.${envType} to .env`);

    // 2. Run prisma generate to update the client
    console.log('🔄 Running prisma generate...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client updated.');

    console.log(`\n🎉 Successfully switched to ${envType} database configuration.\n`);
} catch (error) {
    console.error('❌ Error switching environment:', error);
    process.exit(1);
}
