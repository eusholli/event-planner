const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');

const mode = process.argv[2]; // 'before' or 'after'
const url = process.env.POSTGRES_PRISMA_URL;
const CACHE_DIR = '/tmp/eventplanner_snapshots';
const CACHE_FILE = `${CACHE_DIR}/db_schema_snapshot.json`;

if (!['before', 'after'].includes(mode)) {
  console.error("Mode must be 'before' or 'after'");
  process.exit(1);
}

if (!url) {
  console.error("Missing POSTGRES_PRISMA_URL in environment.");
  process.exit(1);
}

// Ensure the snapshot directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function run() {
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (mode === 'before') {
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      
      const snapshot = {};
      
      for (const row of tablesRes.rows) {
        const table = row.table_name;
        
        // The prisma tracking table is meant to change, we do not verify its contents
        if (table === '_prisma_migrations') continue;

        const colsRes = await client.query(`
          SELECT column_name
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY column_name
        `, [table]);
        
        const columns = colsRes.rows.map(r => r.column_name);
        
        // Sorting by all rows guarantees deterministic ordering
        const orderClause = columns.map(c => `"${c}"`).join(', ');
        const selectClause = columns.map(c => `"${c}"`).join(', ');
        
        let hash = 'empty';
        const dumpFile = `${CACHE_DIR}/${table}_before.jsonl`;
        
        if (columns.length > 0) {
          const dataRes = await client.query(`SELECT ${selectClause} FROM "${table}" ORDER BY ${orderClause}`);
          const hashObj = crypto.createHash('sha256');
          
          const writeStream = fs.createWriteStream(dumpFile);
          
          for (const dataRow of dataRes.rows) {
            const line = JSON.stringify(dataRow) + '\n';
            hashObj.update(line);
            writeStream.write(line);
          }
          
          writeStream.end();
          hash = hashObj.digest('hex');
          
          // Wait for the stream to fully finish to avoid race conditions
          await new Promise((resolve) => writeStream.on('finish', resolve));
        }
        
        snapshot[table] = {
          columns,
          hash,
          dumpFile: columns.length > 0 ? dumpFile : null
        };
      }
      
      fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot, null, 2));
      console.log(`✅ Cached raw data & Hashes locally for ${Object.keys(snapshot).length} database tables.`);
      
    } else if (mode === 'after') {
      if (!fs.existsSync(CACHE_FILE)) {
        throw new Error("No snapshot found from 'before' phase.");
      }
      
      const snapshot = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      let changedTables = 0;
      
      for (const table of Object.keys(snapshot)) {
        const { columns, hash: beforeHash, dumpFile } = snapshot[table];
        
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          );
        `, [table]);
        
        if (!tableExists.rows[0].exists) {
          console.log(`❌ CRITICAL: Table "${table}" was DROPPED entirely.`);
          changedTables++;
          continue;
        }
        
        const orderClause = columns.map(c => `"${c}"`).join(', ');
        const selectClause = columns.map(c => `"${c}"`).join(', ');
        
        let afterHash = 'empty';
        let afterRows = [];
        if (columns.length > 0) {
          // IMPORTANT: we explicitly only SELECT the columns that existed in 'mode=before'.
          // Any newly added columns are blissfully ignored here!
          const dataRes = await client.query(`SELECT ${selectClause} FROM "${table}" ORDER BY ${orderClause}`);
          
          const hashObj = crypto.createHash('sha256');
          for (const dataRow of dataRes.rows) {
            const line = JSON.stringify(dataRow) + '\n';
            hashObj.update(line);
            afterRows.push(dataRow);
          }
          afterHash = hashObj.digest('hex');
        }
        
        if (beforeHash !== afterHash) {
          console.log(`❌ CRITICAL: Values inside table "${table}" were MUTATED.`);
          changedTables++;
          console.log(`\n🔎 INVESTIGATING "${table}" MUTATIONS:`);
          
          if (!dumpFile || !fs.existsSync(dumpFile)) {
             console.log(`   > (Unable to load before-snapshot for granular diff)`);
             continue;
          }
          
          await new Promise((resolve) => {
             const beforeRows = [];
             const rl = readline.createInterface({
                input: fs.createReadStream(dumpFile),
                crlfDelay: Infinity
             });
             
             rl.on('line', (line) => {
                if (line.trim()) beforeRows.push(JSON.parse(line));
             });
             
             rl.on('close', () => {
                // Determine the best field to identify uniquely (standard id or uuid fallback)
                const idField = columns.includes('id') ? 'id' : columns.includes('uuid') ? 'uuid' : null;
                
                if (idField) {
                  // Pairwise exact matching
                  const beforeMap = {};
                  beforeRows.forEach(r => beforeMap[r[idField]] = r);
                  const afterMap = {};
                  afterRows.forEach(r => afterMap[r[idField]] = r);
                  
                  for (const id in beforeMap) {
                     if (!afterMap[id]) {
                        console.log(`   > Row [ID: ${id}] - Was unexplainably DELETED from the table!`);
                     } else {
                        // Compare fields
                        let differencesFound = 0;
                        for (const col of columns) {
                           const v1 = JSON.stringify(beforeMap[id][col]);
                           const v2 = JSON.stringify(afterMap[id][col]);
                           if (v1 !== v2) {
                              console.log(`   > Row [ID: ${id}] - Field '${col}' changed: ${v1} -> ${v2}`);
                              differencesFound++;
                           }
                        }
                     }
                  }
                  
                  for (const id in afterMap) {
                     if (!beforeMap[id]) {
                        console.log(`   > Row [ID: ${id}] - Was unexpectedly ADDED to the table!`);
                     }
                  }
                } else {
                  // Fallback to sequential index difference tracking
                  const maxRows = Math.max(beforeRows.length, afterRows.length);
                  for (let i = 0; i < maxRows; i++) {
                     if (!beforeRows[i]) {
                         console.log(`   > Row [Index ${i}] was ADDED at the end.`);
                     } else if (!afterRows[i]) {
                         console.log(`   > Row [Index ${i}] was DELETED.`);
                     } else {
                         for (const col of columns) {
                           const v1 = JSON.stringify(beforeRows[i][col]);
                           const v2 = JSON.stringify(afterRows[i][col]);
                           if (v1 !== v2) {
                              console.log(`   > Row [Index ${i}] - Field '${col}' changed: ${v1} -> ${v2}`);
                           }
                         }
                     }
                  }
                }
                resolve();
             });
          });
          console.log("");
        }
      }
      
      if (changedTables === 0) {
         console.log(`\n=========================================================`);
         console.log(`🔒 INTEGRITY VERIFIED: All ${Object.keys(snapshot).length} original tables retained 100% mathematically identical data values.`);
         console.log(`=========================================================\n`);
      } else {
         console.log(`\n=========================================================`);
         console.log(`⚠️  WARNING: Found compromised values in ${changedTables} table(s).`);
         console.log(`=========================================================\n`);
         process.exit(1);
      }
    }
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error("Deep Checksum Error:", err);
  process.exit(1);
});
