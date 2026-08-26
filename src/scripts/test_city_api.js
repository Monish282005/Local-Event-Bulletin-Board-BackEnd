const { Country, State, City } = require('country-state-city');
const http = require('https');

function fetchCitiesFromApi(country, state) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ country, state });
    const req = http.request(
      'https://countriesnow.space/api/v0.1/countries/state/cities',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.data || []);
          } catch (e) {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('Testing countriesnow API for India, Karnataka:');
  const apiCities = await fetchCitiesFromApi('India', 'Karnataka');
  console.log(`API returned ${apiCities.length} cities:`, apiCities.slice(0, 15));

  const cObj = Country.getAllCountries().find(c => c.name === 'India');
  const sObj = State.getStatesOfCountry(cObj.isoCode).find(s => s.name.includes('Karnataka'));
  const cscCities = City.getCitiesOfState(cObj.isoCode, sObj.isoCode).map(c => c.name);
  console.log(`\ncountry-state-city returned ${cscCities.length} cities:`, cscCities.slice(0, 15));
}

test();
