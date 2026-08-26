const { getCountries, getStates, getDistricts } = require('../utils/locationData');

const kaDistricts = getDistricts('India', 'Karnataka');
console.log(`Total Districts for Karnataka: ${kaDistricts.length}`);
console.log('Karnataka Districts:', kaDistricts);

const mhDistricts = getDistricts('India', 'Maharashtra');
console.log(`\nTotal Districts for Maharashtra: ${mhDistricts.length}`);
console.log('Sample Maharashtra Districts:', mhDistricts.slice(0, 10));
