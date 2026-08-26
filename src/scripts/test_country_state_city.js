const { Country, State, City } = require('country-state-city');

const countries = Country.getAllCountries();
console.log(`Total Countries: ${countries.length}`);
console.log('Sample countries:', countries.slice(0, 5).map(c => ({ name: c.name, isoCode: c.isoCode })));

const inIso = countries.find(c => c.name === 'India')?.isoCode || 'IN';
const states = State.getStatesOfCountry(inIso);
console.log(`\nTotal States in India: ${states.length}`);
console.log('Sample states:', states.slice(0, 5).map(s => ({ name: s.name, isoCode: s.isoCode })));

const kaIso = states.find(s => s.name.includes('Karnataka'))?.isoCode || 'KA';
const cities = City.getCitiesOfState(inIso, kaIso);
console.log(`\nTotal Cities in Karnataka: ${cities.length}`);
console.log('Sample cities:', cities.slice(0, 5).map(c => c.name));
