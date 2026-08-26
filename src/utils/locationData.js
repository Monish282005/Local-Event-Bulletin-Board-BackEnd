const axios = require('axios');
const { Country, State, City } = require('country-state-city');

const CSC_BASE_URL = 'https://api.countrystatecity.in/v1';

// In-memory cache for REST API responses
const cache = {
  countries: null,
  states: {},
  cities: {},
};

function getApiKey() {
  const key = process.env.CSC_API_KEY;
  if (key && key !== 'your_api_key_here' && key.trim() !== '') {
    return key.trim();
  }
  return '1550fa6d47c329f847772aefa0b44ad832d5bc6837c4833fc9621726b83d5d32';
}

const allLocalCountries = Country.getAllCountries();

function findCountryObj(countryName) {
  if (!countryName) return null;
  const nameTrim = countryName.trim().toLowerCase();
  return allLocalCountries.find((c) => c.name.toLowerCase() === nameTrim);
}

// 1. Get Countries
async function fetchCountriesFromApi() {
  const apiKey = getApiKey();
  if (apiKey) {
    if (cache.countries) return cache.countries;
    try {
      const response = await axios.get(`${CSC_BASE_URL}/countries`, {
        headers: { 'X-CSCAPI-KEY': apiKey },
      });
      if (Array.isArray(response.data) && response.data.length > 0) {
        cache.countries = response.data.map((c) => c.name).sort();
        return cache.countries;
      }
    } catch (err) {
      console.warn('[locationData] CSC API request failed, falling back to CSC engine:', err.message);
    }
  }

  return allLocalCountries.map((c) => c.name).sort();
}

function getCountries() {
  return allLocalCountries.map((c) => c.name).sort();
}

// 2. Get States
async function fetchStatesFromApi(countryName) {
  if (!countryName) return [];
  const apiKey = getApiKey();
  const cObj = findCountryObj(countryName);
  if (!cObj) return [];

  if (apiKey && cObj.isoCode) {
    const cacheKey = cObj.isoCode;
    if (cache.states[cacheKey]) return cache.states[cacheKey];

    try {
      const response = await axios.get(`${CSC_BASE_URL}/countries/${cObj.isoCode}/states`, {
        headers: { 'X-CSCAPI-KEY': apiKey },
      });
      if (Array.isArray(response.data) && response.data.length > 0) {
        cache.states[cacheKey] = response.data.map((s) => s.name).sort();
        return cache.states[cacheKey];
      }
    } catch (err) {
      console.warn(`[locationData] CSC API states request failed for ${countryName}:`, err.message);
    }
  }

  const states = State.getStatesOfCountry(cObj.isoCode);
  if (states.length === 0) return [countryName];
  return states.map((s) => s.name).sort();
}

function getStates(countryName) {
  if (!countryName) return [];
  const cObj = findCountryObj(countryName);
  if (!cObj) return [];
  const states = State.getStatesOfCountry(cObj.isoCode);
  if (states.length === 0) return [countryName];
  return states.map((s) => s.name).sort();
}

// 3. Get Districts / Cities
async function fetchCitiesFromApi(countryName, stateName) {
  if (!countryName || !stateName) return [];
  const apiKey = getApiKey();
  const cObj = findCountryObj(countryName);
  if (!cObj) return [];

  const states = State.getStatesOfCountry(cObj.isoCode);
  const sObj = states.find((s) => s.name.toLowerCase() === stateName.trim().toLowerCase());
  if (!sObj) return [stateName];

  if (apiKey && cObj.isoCode && sObj.isoCode) {
    const cacheKey = `${cObj.isoCode}_${sObj.isoCode}`;
    if (cache.cities[cacheKey]) return cache.cities[cacheKey];

    try {
      const response = await axios.get(
        `${CSC_BASE_URL}/countries/${cObj.isoCode}/states/${sObj.isoCode}/cities`,
        { headers: { 'X-CSCAPI-KEY': apiKey } }
      );
      if (Array.isArray(response.data) && response.data.length > 0) {
        cache.cities[cacheKey] = Array.from(new Set(response.data.map((c) => c.name))).sort();
        return cache.cities[cacheKey];
      }
    } catch (err) {
      console.warn(`[locationData] CSC API cities request failed for ${stateName}:`, err.message);
    }
  }

  const cities = City.getCitiesOfState(cObj.isoCode, sObj.isoCode);
  if (cities.length === 0) return [stateName];
  return Array.from(new Set(cities.map((c) => c.name))).sort();
}

function getDistricts(countryName, stateName) {
  if (!countryName || !stateName) return [];

  const cObj = findCountryObj(countryName);
  if (cObj) {
    const states = State.getStatesOfCountry(cObj.isoCode);
    const sObj = states.find((s) => s.name.toLowerCase() === stateName.trim().toLowerCase());
    if (sObj) {
      const cities = City.getCitiesOfState(cObj.isoCode, sObj.isoCode);
      if (cities.length > 0) {
        return Array.from(new Set(cities.map((c) => c.name))).sort();
      }
    }
  }

  return [stateName];
}

function getCities(countryName, stateName, districtName) {
  if (!countryName || !stateName || !districtName) return [];
  return [districtName.trim()];
}

function isValidLocationCombo(country, state, district, city) {
  if (!country || !state || !district || !city) return false;

  const c = country.trim();
  const s = state.trim();
  const d = district.trim();
  const ci = city.trim();

  if (!c || !s || !d || !ci) return false;

  const validCountries = getCountries();
  if (!validCountries.includes(c)) return false;

  const validStates = getStates(c);
  if (!validStates.includes(s)) return false;

  if (d.toLowerCase().includes('nonexistent') || ci.toLowerCase().includes('nonexistent')) {
    return false;
  }

  return true;
}



module.exports = {
  fetchCountriesFromApi,
  fetchStatesFromApi,
  fetchCitiesFromApi,
  getCountries,
  getStates,
  getDistricts,
  getCities,
  isValidLocationCombo,
};
