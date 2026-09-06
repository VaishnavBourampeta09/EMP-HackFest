import assert from 'node:assert/strict';
import { searchPlaces } from '../src/server/routing/geocode.js';

// Verify both geocoders constrain ambiguous names to the supported area.
const originalFetch = globalThis.fetch;
const originalToken = process.env.MAPBOX_ACCESS_TOKEN;
const originalUrl = process.env.NOMINATIM_URL;
try {
  delete process.env.MAPBOX_ACCESS_TOKEN;
  process.env.NOMINATIM_URL = 'https://nominatim.example';
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('bounded'), '1');
    assert.equal(url.searchParams.get('viewbox'), '-122.24,47.76,-122.05,47.62');
    return Response.json({ features: [{ geometry: { type: 'Point', coordinates: [-122.12, 47.67] }, properties: { display_name: 'Local library' } }] });
  };
  assert.equal((await searchPlaces('Library'))[0].lat, 47.67);
  process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('bbox'), '-122.24,47.62,-122.05,47.76');
    return Response.json({ features: [{ geometry: { type: 'Point', coordinates: [-122.12, 47.67] }, properties: { name: 'Local school' } }] });
  };
  assert.equal((await searchPlaces('School', { allowPublicFallback: false }))[0].lat, 47.67);
  globalThis.fetch = () => { throw new Error('Coordinates must not require geocoding'); };
  assert.equal((await searchPlaces([47.67, -122.12]))[0].lng, -122.12);
  console.log('Geocoding regression checks passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
  else process.env.MAPBOX_ACCESS_TOKEN = originalToken;
  if (originalUrl === undefined) delete process.env.NOMINATIM_URL;
  else process.env.NOMINATIM_URL = originalUrl;
}
