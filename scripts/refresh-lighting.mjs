import { writeFile } from 'node:fs/promises';

const OverpassAPIResponse = await fetch('https://overpass-api.de/api/interpreter', {
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

if (!OverpassAPIResponse.ok) {
  throw new Error(`Overpass returned ${OverpassAPIResponse.status}`);
}

const apiresponsedata = await OverpassAPIResponse.json();
if (apiresponsedata.remark || !Array.isArray(apiresponsedata.elements)) {
  throw new Error(apiresponsedata.remark || 'Invalid snapshot');
}

const EXTRACTED_LIGHTING_SEGMENTS = apiresponsedata.elements
  .filter(highwayWay => highwayWay.geometry?.length > 1)
  .map(highwayWay => ({
    id: highwayWay.id,
    lit: highwayWay.tags.lit,
    points: highwayWay.geometry.map(coordinatePoint => [coordinatePoint.lat, coordinatePoint.lon]),
  }));

if (!EXTRACTED_LIGHTING_SEGMENTS.length) {
  throw new Error('Empty snapshot; preserving the existing file.');
}

const REDMOND_LIGHTING_DATA = {
  source: 'OpenStreetMap / Overpass',
  attribution: '© OpenStreetMap contributors (ODbL)',
  fetchedAt: new Date().toISOString(),
  bounds: [-122.24, 47.62, -122.05, 47.76],
  segments: EXTRACTED_LIGHTING_SEGMENTS,
};

await writeFile(
  new URL('../src/data/redmondLightingSegments.json', import.meta.url),
  JSON.stringify(REDMOND_LIGHTING_DATA)
);

console.log(`Saved ${EXTRACTED_LIGHTING_SEGMENTS.length} tagged lighting segments.`);
