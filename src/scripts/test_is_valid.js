const { getCountries, getStates, getDistricts, isValidLocationCombo } = require('../utils/locationData');

console.log('getCountries contains India:', getCountries().includes('India'));
console.log('getStates(India) contains Karnataka:', getStates('India').includes('Karnataka'));
console.log('getDistricts(India, Karnataka) sample:', getDistricts('India', 'Karnataka').slice(0, 10));
console.log('getDistricts(India, Karnataka) contains Bengaluru Urban:', getDistricts('India', 'Karnataka').includes('Bengaluru Urban'));
console.log('isValidLocationCombo result:', isValidLocationCombo('India', 'Karnataka', 'Bengaluru Urban', 'Bengaluru'));
