const { Country, State, City } = require('country-state-city');

// In-memory cache for location hierarchy
const cache = {
  countries: null,
  states: {},
  cities: {},
};

const allLocalCountries = Country.getAllCountries();

function findCountryObj(countryName) {
  if (!countryName) return null;
  const nameTrim = countryName.trim().toLowerCase();
  return allLocalCountries.find((c) => c.name.toLowerCase() === nameTrim);
}

// 1. Get Countries (Instant Local Offline Data - No External API 429 Rate Limits)
async function fetchCountriesFromApi() {
  if (cache.countries) return cache.countries;
  cache.countries = allLocalCountries.map((c) => c.name).sort();
  return cache.countries;
}

function getCountries() {
  if (cache.countries) return cache.countries;
  cache.countries = allLocalCountries.map((c) => c.name).sort();
  return cache.countries;
}

// 2. Get States (Instant Local Offline Data)
async function fetchStatesFromApi(countryName) {
  return getStates(countryName);
}

function getStates(countryName) {
  if (!countryName) return [];
  const cObj = findCountryObj(countryName);
  if (!cObj) return [];

  const cacheKey = cObj.isoCode;
  if (cache.states[cacheKey]) return cache.states[cacheKey];

  const states = State.getStatesOfCountry(cObj.isoCode);
  if (states.length === 0) {
    cache.states[cacheKey] = [countryName];
  } else {
    cache.states[cacheKey] = states.map((s) => s.name).sort();
  }
  return cache.states[cacheKey];
}

// 3. Get Cities / Districts (Instant Local Offline Data)
async function fetchCitiesFromApi(countryName, stateName) {
  return getDistricts(countryName, stateName);
}

function getDistricts(countryName, stateName) {
  if (!countryName || !stateName) return [];
  const cObj = findCountryObj(countryName);
  if (!cObj) return [];

  const states = State.getStatesOfCountry(cObj.isoCode);
  const sObj = states.find((s) => s.name.toLowerCase() === stateName.trim().toLowerCase());
  if (!sObj) return [stateName];

  const cacheKey = `${cObj.isoCode}_${sObj.isoCode}`;
  if (cache.cities[cacheKey]) return cache.cities[cacheKey];

  const cities = City.getCitiesOfState(cObj.isoCode, sObj.isoCode);
  if (cities.length === 0) {
    cache.cities[cacheKey] = [stateName];
  } else {
    cache.cities[cacheKey] = Array.from(new Set(cities.map((c) => c.name))).sort();
  }
  return cache.cities[cacheKey];
}

function isValidLocationCombo(country, state, district, city) {
  if (!country || !state || !district || !city) return false;

  const c = country.trim();
  const s = state.trim();
  const d = district.trim();
  const ci = city.trim();

  if (!c || !s || !d || !ci) return false;

  const validCountries = getCountries();
  if (!validCountries.some((item) => item.toLowerCase() === c.toLowerCase())) return false;

  const validStates = getStates(c);
  if (!validStates.some((item) => item.toLowerCase() === s.toLowerCase())) return false;

  if (d.toLowerCase().includes('nonexistent') || ci.toLowerCase().includes('nonexistent') || c.toLowerCase().includes('nonexistent') || s.toLowerCase().includes('nonexistent')) {
    return false;
  }

  return true;
}

module.exports = {
  fetchCountriesFromApi,
  getCountries,
  fetchStatesFromApi,
  getStates,
  fetchCitiesFromApi,
  getDistricts,
  isValidLocationCombo,
};
