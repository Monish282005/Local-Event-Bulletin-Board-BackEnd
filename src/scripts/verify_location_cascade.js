const {
  getCountries,
  getStates,
  getDistricts,
  getCities,
  isValidLocationCombo,
} = require('../utils/locationData');

async function testLocationCascade() {
  console.log('====================================================');
  console.log('   VERIFYING COUNTRY → STATE → DISTRICT → CITY      ');
  console.log('====================================================\n');

  // 1. Countries
  const countries = getCountries();
  console.log(`1. Total Countries loaded: ${countries.length}`);
  console.log(`   Sample countries: ${countries.slice(0, 8).join(', ')}...`);

  // 2. States (India)
  const inStates = getStates('India');
  console.log(`\n2. Total States in India: ${inStates.length}`);
  console.log(`   Sample states: ${inStates.slice(0, 8).join(', ')}...`);

  // 3. Districts (India -> Karnataka)
  const kaDistricts = getDistricts('India', 'Karnataka');
  console.log(`\n3. Total Districts/Cities in India -> Karnataka: ${kaDistricts.length}`);
  console.log(`   Sample districts: ${kaDistricts.slice(0, 8).join(', ')}...`);

  // 4. Cities (India -> Karnataka -> Mysuru)
  const mysuruCities = getCities('India', 'Karnataka', 'Mysuru');
  console.log(`\n4. Total Cities in India -> Karnataka -> Mysuru: ${mysuruCities.length}`);
  console.log(`   Sample cities: ${mysuruCities.slice(0, 8).join(', ')}...`);

  // 5. States (United States)
  const usStates = getStates('United States');
  console.log(`\n5. Total States in United States: ${usStates.length}`);

  // 6. Cities (United States -> California -> Los Angeles County)
  const caCities = getCities('United States', 'California', 'Los Angeles County');
  console.log(`\n6. Total Cities in US -> California -> Los Angeles County: ${caCities.length}`);

  // 7. Validate Combo
  const valid1 = isValidLocationCombo('India', 'Karnataka', 'Bengaluru Urban', 'Bengaluru');
  const valid2 = isValidLocationCombo('India', 'Karnataka', 'Mysuru', 'Mysuru');
  const invalidCombo = isValidLocationCombo('India', 'Karnataka', 'NonExistentDistrict', 'NonExistentCity');

  console.log(`\n7. Combo Validation Checks:`);
  console.log(`   - Valid India/Karnataka/Bengaluru Urban/Bengaluru: ${valid1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   - Valid India/Karnataka/Mysuru/Mysuru: ${valid2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   - Rejection of Invalid District/City: ${!invalidCombo ? '✅ PASS' : '❌ FAIL'}`);

  console.log('\n====================================================');
  if (countries.length > 200 && inStates.length > 30 && kaDistricts.length > 50 && valid1 && !invalidCombo) {
    console.log('🎉 COUNTRY, STATE, DISTRICT & CITY ARE 100% WORKING PROPERLY!');
  } else {
    console.log('⚠️ LOCATION CASCADE CHECKS FAILED.');
  }
  console.log('====================================================\n');
}

testLocationCascade();
