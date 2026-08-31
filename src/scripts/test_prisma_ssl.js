const { PrismaClient } = require('@prisma/client');

const urls = [
  'mysql://bulletin_user:BulletinPass123!@34.47.189.145:3306/local_event_bulletin_board?sslaccept=accept_invalid_certs',
  'mysql://bulletin_user:BulletinPass123!@34.47.189.145:3306/local_event_bulletin_board?sslmode=prefer',
  'mysql://bulletin_user:BulletinPass123!@34.47.189.145:3306/local_event_bulletin_board?sslmode=required',
  'mysql://bulletin_user:BulletinPass123!@34.47.189.145:3306/local_event_bulletin_board?sslmode=verify-ca',
  'mysql://bulletin_user:BulletinPass123!@34.47.189.145:3306/local_event_bulletin_board',
];

async function testPrismaUrls() {
  for (const url of urls) {
    console.log(`Testing Prisma URL: ${url}`);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      await prisma.$connect();
      console.log(`\n🎉 PRISMA SUCCESS! Working URL: ${url}`);
      await prisma.$disconnect();
      return url;
    } catch (err) {
      console.log(`❌ Prisma Failed:`, err.message);
      await prisma.$disconnect();
    }
  }
}

testPrismaUrls();
