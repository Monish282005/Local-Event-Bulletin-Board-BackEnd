const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function ensureDatabaseExists() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('DATABASE_URL not set in environment.');
    return;
  }

  try {
    const url = new URL(dbUrl);
    const databaseName = url.pathname.replace('/', '') || 'event';
    
    // Create connection options without specifying database
    const connection = await mysql.createConnection({
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port) : 3306,
      user: url.username || 'root',
      password: url.password || 'root',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\`;`);
    console.log(`Database '${databaseName}' ensured to exist.`);
    await connection.end();
  } catch (error) {
    console.error('Error ensuring database exists:', error.message);
  }
}

if (require.main === module) {
  ensureDatabaseExists();
}

module.exports = { ensureDatabaseExists };
