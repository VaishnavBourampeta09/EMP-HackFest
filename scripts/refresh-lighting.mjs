import { writeFile } from 'node:fs/promises';

const overpass_api_response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'User-Agent': 'Sentinel/0.1 (Redmond routing prototype)',
    Accept: 'application/json'
  },
  body: new URLSearchParams({
    data: '[out:json][timeout:60];way[highway][lit~"^(yes|no)$"](47.62,-122.24,47.76,-122.05);out geom;'
  }),
  signal: AbortSignal.timeout(90000),
});

if (!overpass_api_response.ok) {
  throw new Error(`Overpass returned ${overpass_api_response.status}`);
}

const api_response_data = await overpass_api_response.json();
if (api_response_data.remark || !Array.isArray(api_response_data.elements)) {
  throw new Error(api_response_data.remark || 'Invalid snapshot');
}

const extracted_lighting_segments = api_response_data.elements
  .filter(highway_way => highway_way.geometry?.length > 1)
  .map(highway_way => ({
    id: highway_way.id,
    lit: highway_way.tags.lit,
    points: highway_way.geometry.map(coordinate_point => [coordinate_point.lat, coordinate_point.lon]),
  }));

if (!extracted_lighting_segments.length) {
  throw new Error('Empty snapshot; preserving the existing file.');
}

const redmond_lighting_data = {
  source: 'OpenStreetMap / Overpass',
  attribution: '© OpenStreetMap contributors (ODbL)',
  fetchedAt: new Date().toISOString(),
  bounds: [-122.24, 47.62, -122.05, 47.76],
  segments: extracted_lighting_segments,
};

await writeFile(
  new URL('../src/data/redmondLightingSegments.json', import.meta.url),
  JSON.stringify(redmond_lighting_data)
);

console.log(`Saved ${extracted_lighting_segments.length} tagged lighting segments.`);
