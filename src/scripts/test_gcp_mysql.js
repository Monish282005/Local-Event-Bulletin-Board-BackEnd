const mysql = require('mysql2/promise');

async function testConnection() {
  const configs = [
    { host: '34.47.189.145', user: 'bulletin_user', password: 'BulletinPass123!', database: 'local_event_bulletin_board' },
    { host: '34.47.189.145', user: 'root', password: 'Bulletin@08', database: 'local_event_bulletin_board' },
  ];

  for (const cfg of configs) {
    try {
      console.log(`Testing user: ${cfg.user}...`);
      const conn = await mysql.createConnection(cfg);
      console.log(`✅ Success for ${cfg.user}!`);
      await conn.end();
    } catch (err) {
      console.error(`❌ Failed for ${cfg.user}:`, err.message);
    }
  }
}

testConnection();
