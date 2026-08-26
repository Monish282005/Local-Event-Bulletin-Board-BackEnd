const { Country, State, City } = require('country-state-city');

const cObj = Country.getAllCountries().find(c => c.name === 'India');
const sObj = State.getStatesOfCountry(cObj.isoCode).find(s => s.name.includes('Karnataka'));
const cities = City.getCitiesOfState(cObj.isoCode, sObj.isoCode).map(c => c.name);

console.log(`Total cities in Karnataka: ${cities.length}`);

// Sample lookup for Mysuru
const mysuruCities = cities.filter(c => c.toLowerCase().includes('mysur') || c.toLowerCase().includes('myso'));
console.log('Mysuru matching cities:', mysuruCities);

// Sample lookup for Belagavi / Belgaum
const belagaviCities = cities.filter(c => c.toLowerCase().includes('bela') || c.toLowerCase().includes('belg'));
console.log('Belagavi matching cities:', belagaviCities);
