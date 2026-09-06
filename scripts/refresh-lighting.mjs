import { writeFile } from 'node:fs/promises';

// Manual snapshot refresh only; route planning never contacts Overpass.
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'Sentinel/0.1 (Redmond routing prototype)', Accept: 'application/json' },
  body: new URLSearchParams({ data: '[out:json][timeout:60];way[highway][lit~"^(yes|no)$"](47.62,-122.24,47.76,-122.05);out geom;' }),
  signal: AbortSignal.timeout(90000),
});
if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
const payload = await response.json();
if (payload.remark || !Array.isArray(payload.elements)) throw new Error(payload.remark || 'Invalid snapshot');
const segments = payload.elements.filter(w => w.geometry?.length > 1).map(w => ({
  id: w.id, lit: w.tags.lit, points: w.geometry.map(p => [p.lat, p.lon]),
}));
if (!segments.length) throw new Error('Empty snapshot; preserving the existing file.');
await writeFile(new URL('../src/data/redmondLightingSegments.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap / Overpass', attribution: '© OpenStreetMap contributors (ODbL)',
  fetchedAt: new Date().toISOString(), bounds: [-122.24, 47.62, -122.05, 47.76], segments,
}));
console.log(`Saved ${segments.length} tagged lighting segments.`);
