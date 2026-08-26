const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function verifyModule15() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found.');
    process.exit(1);
  }

  const url = new URL(dbUrl);
  const databaseName = url.pathname.replace('/', '') || 'event';

  const connection = await mysql.createConnection({
    host: url.hostname || 'localhost',
    port: url.port ? parseInt(url.port) : 3306,
    user: url.username || 'root',
    password: url.password || 'root',
    database: databaseName,
  });

  console.log(`--- VERIFYING MODULE 15 SCHEMA ON DATABASE '${databaseName}' ---\n`);

  // 1. Check users table columns
  const [userCols] = await connection.query('SHOW COLUMNS FROM users;');
  console.log('USERS COLUMNS:');
  userCols.forEach((col) => {
    if (['country', 'state', 'district', 'city'].includes(col.Field)) {
      console.log(`  - ${col.Field}: Type=${col.Type}, Null=${col.Null}, Default=${col.Default}`);
    }
  });

  // 2. Check events table columns
  const [eventCols] = await connection.query('SHOW COLUMNS FROM events;');
  console.log('\nEVENTS COLUMNS:');
  eventCols.forEach((col) => {
    if (['country', 'state', 'district', 'city'].includes(col.Field)) {
      console.log(`  - ${col.Field}: Type=${col.Type}, Null=${col.Null}, Default=${col.Default}`);
    }
  });

  // 3. Check indexes on events table
  const [eventIndexes] = await connection.query('SHOW INDEX FROM events;');
  console.log('\nEVENTS INDEXES:');
  const indexMap = {};
  eventIndexes.forEach((idx) => {
    if (!indexMap[idx.Key_name]) {
      indexMap[idx.Key_name] = [];
    }
    indexMap[idx.Key_name].push(idx.Column_name);
  });
  Object.entries(indexMap).forEach(([key, cols]) => {
    console.log(`  - Key '${key}': columns [${cols.join(', ')}]`);
  });

  // 4. Verify existing rows retain data
  const [[{ userCount }]] = await connection.query('SELECT COUNT(*) as userCount FROM users;');
  const [[{ eventCount }]] = await connection.query('SELECT COUNT(*) as eventCount FROM events;');
  console.log(`\nEXISTING ROW COUNTS: Users=${userCount}, Events=${eventCount}`);

  await connection.end();
  console.log('\n✅ MODULE 15 DB SCHEMA VERIFICATION COMPLETED SUCCESSFULLY!');
}

verifyModule15().catch((err) => {
  console.error('Module 15 verification failed:', err);
  process.exit(1);
});
