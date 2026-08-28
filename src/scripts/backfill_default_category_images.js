const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_CATEGORY_IMAGES = {
  sports: 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787907059/Sport.jpg',
  music: 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787906417/Music.jpg',
  food: 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787906475/Food.jpg',
  yard_sale: 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787906982/Yard.jpg',
  other: 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787906587/Other.jpg',
};

function getCategoryDefaultImage(category) {
  const cat = (category || '').toLowerCase().trim();
  if (cat === 'sports' || cat === 'sport') return DEFAULT_CATEGORY_IMAGES.sports;
  if (cat === 'music') return DEFAULT_CATEGORY_IMAGES.music;
  if (cat === 'food' || cat === 'food & drink') return DEFAULT_CATEGORY_IMAGES.food;
  if (cat === 'yard_sale' || cat === 'yard' || cat === 'yard sale') return DEFAULT_CATEGORY_IMAGES.yard_sale;
  return DEFAULT_CATEGORY_IMAGES.other;
}

async function backfillDefaultCategoryImages() {
  console.log('--- STARTING DATABASE CATEGORY IMAGE BACKFILL ---');
  try {
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { image_url: null },
          { image_url: '' },
        ],
      },
    });

    console.log(`Found ${events.length} events needing default category image backfill.`);

    let updatedCount = 0;
    for (const evt of events) {
      const defaultImg = getCategoryDefaultImage(evt.category);
      await prisma.event.update({
        where: { id: evt.id },
        data: { image_url: defaultImg },
      });
      console.log(`✅ Backfilled Event "${evt.title}" (${evt.category}) -> ${defaultImg}`);
      updatedCount++;
    }

    console.log(`\n🎉 SUCCESSFULLY BACKFILLED ${updatedCount} EVENTS WITH DEFAULT CATEGORY IMAGES!`);
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

backfillDefaultCategoryImages();
