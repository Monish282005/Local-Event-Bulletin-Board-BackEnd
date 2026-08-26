const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEventLocations() {
  console.log('--- FIXING MISMATCHED EVENT LOCATIONS IN DATABASE ---\n');

  // Fix "Summer meet": it was located in Coimbatore
  await prisma.event.updateMany({
    where: { title: 'Summer meet' },
    data: {
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      city: 'Coimbatore',
      neighborhood: 'Gandhipuram',
      location: 'VOC Park',
    },
  });
  console.log('✅ Updated "Summer meet" to Coimbatore, Tamil Nadu');

  // Fix "Hai": it was located in Chennai
  await prisma.event.updateMany({
    where: { title: 'Hai' },
    data: {
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Chennai',
      city: 'Chennai',
      neighborhood: 'T. Nagar',
      location: 'Anna Salai',
    },
  });
  console.log('✅ Updated "Hai" to Chennai, Tamil Nadu');

  console.log('\n🎉 ALL MISMATCHED EVENT LOCATIONS FIXED SUCCESSFULLY!');
  await prisma.$disconnect();
}

fixEventLocations().catch((err) => {
  console.error(err);
  process.exit(1);
});
