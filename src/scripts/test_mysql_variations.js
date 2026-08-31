const mysql = require('mysql2/promise');

async function testVariations() {
  const passwordsToTest = [
    'BulletinPass123!',
    'BulletinPass123',
    'Bulletin@08',
    'Bulletin08',
    'Bulletin@08!',
    'bulletinpass123!',
    'bulletin_user',
    'root',
  ];

  const users = ['bulletin_user', 'root'];

  for (const user of users) {
    for (const pass of passwordsToTest) {
      try {
        console.log(`Testing user: "${user}" with password: "${pass}"...`);
        const conn = await mysql.createConnection({
          host: '34.47.189.145',
          port: 3306,
          user: user,
          password: pass,
          database: 'local_event_bulletin_board',
          ssl: { rejectUnauthorized: false }, // test with SSL
        });
        console.log(`\n🎉 SUCCESS! Connected as user: "${user}" with password: "${pass}"!`);
        await conn.end();
        return;
      } catch (err) {
        // failed
      }
    }
  }
  console.log('\n❌ All tested variations failed. Access denied.');
}

testVariations();
