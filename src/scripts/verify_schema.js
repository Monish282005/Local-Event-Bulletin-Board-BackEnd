const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function verifyModule1() {
  console.log('--- Starting Module 1 Schema Verification ---');
  let connection;
  try {
    const url = new URL(process.env.DATABASE_URL);
    connection = await mysql.createConnection({
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port) : 3306,
      user: url.username || 'root',
      password: url.password || 'root',
      database: url.pathname.replace('/', '') || 'event',
    });

    // 1. Verify InnoDB Engine
    const [tableStatuses] = await connection.query(`
      SELECT TABLE_NAME, ENGINE 
      SELECT_TABLE: FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'event' AND TABLE_NAME IN ('users', 'events');
    `.replace('SELECT_TABLE:', ''));

    console.log('Table Engines:', tableStatuses);
    for (const table of tableStatuses) {
      if (table.ENGINE !== 'InnoDB') {
        throw new Error(`Table ${table.TABLE_NAME} engine is ${table.ENGINE}, expected InnoDB!`);
      }
    }
    console.log('✅ Criteria 3 Passed: Both tables use InnoDB storage engine.');

    // 2. Verify Indexes on events
    const [eventsIndexes] = await connection.query('SHOW INDEX FROM events;');
    const indexNames = eventsIndexes.map(idx => idx.Column_name);
    console.log('Indexes on events table columns:', indexNames);

    const requiredIndexes = ['event_datetime', 'neighborhood', 'category'];
    for (const reqIdx of requiredIndexes) {
      if (!indexNames.includes(reqIdx)) {
        throw new Error(`Missing required index on column: ${reqIdx}`);
      }
    }
    console.log('✅ Criteria 4 Passed: All required indexes (event_datetime, neighborhood, category) present on events.');

    // 3. Verify Unique index on users.email
    const [usersIndexes] = await connection.query('SHOW INDEX FROM users;');
    const emailIndex = usersIndexes.find(idx => idx.Column_name === 'email' && idx.Non_unique === 0);
    if (!emailIndex) {
      throw new Error('Missing unique index on users.email!');
    }
    console.log('✅ Unique index on users.email confirmed.');

    // 4. Verify Foreign Key Constraint Enforcement
    console.log('Testing Foreign Key constraint enforcement...');
    let fkFailedAsExpected = false;
    try {
      await connection.query(`
        INSERT INTO events (id, title, description, category, location, neighborhood, event_datetime, created_by)
        VALUES ('invalid-event-id-1', 'Test Event', 'Description', 'music', 'Location', 'Downtown', NOW(), 'non-existent-user-id');
      `);
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.message.includes('foreign key constraint fails')) {
        fkFailedAsExpected = true;
        console.log('✅ FK Enforcement Error caught as expected:', err.message);
      } else {
        throw err;
      }
    }
    if (!fkFailedAsExpected) {
      throw new Error('Foreign key constraint failed to block invalid created_by reference!');
    }
    console.log('✅ Criteria 5 Passed: Foreign key constraint enforced.');

    // 5. Verify ENUM Validation
    console.log('Testing ENUM constraint validation...');
    let enumFailedAsExpected = false;
    try {
      await connection.query(`
        INSERT INTO events (id, title, description, category, location, neighborhood, event_datetime)
        VALUES ('invalid-event-id-2', 'Test Event 2', 'Description', 'invalid_category_value', 'Location', 'Downtown', NOW());
      `);
    } catch (err) {
      if (err.code === 'WARN_DATA_TRUNCATED' || err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || err.message.includes('Data truncated') || err.message.includes('category')) {
        enumFailedAsExpected = true;
        console.log('✅ ENUM Validation Error caught as expected:', err.message);
      } else {
        throw err;
      }
    }
    if (!enumFailedAsExpected) {
      throw new Error('ENUM constraint failed to block invalid category value!');
    }
    console.log('✅ Criteria 6 Passed: ENUM column rejects invalid categories.');

    console.log('\n--- ALL MODULE 1 ACCEPTANCE CRITERIA PASSED SUCCESSFULLY ---');
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

verifyModule1();
