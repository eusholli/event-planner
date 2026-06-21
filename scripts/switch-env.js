const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// The project uses a single database configuration: `.env.main` is the default.
const envType = 'main';

const rootDir = process.cwd();
const sourceEnv = path.join(rootDir, `.env.${envType}`);
const targetEnv = path.join(rootDir, '.env');

if (!fs.existsSync(sourceEnv)) {
    console.error(`Error: Source environment file ${sourceEnv} not found.`);
    process.exit(1);
}

console.log(`\n🔄 Applying ${envType.toUpperCase()} environment...`);

try {
    // 1. Copy the .env file
    fs.copyFileSync(sourceEnv, targetEnv);
    console.log(`✅ Copied .env.${envType} to .env`);

    // 2. Run prisma generate to update the client
    console.log('🔄 Running prisma generate...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client updated.');

    console.log(`\n🎉 Successfully applied ${envType} database configuration.\n`);
} catch (error) {
    console.error('❌ Error applying environment:', error);
    process.exit(1);
}
