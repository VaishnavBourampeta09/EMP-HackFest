import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => read(p).trim();

const inlineModule = (p) =>
  read(p)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('import '))
    .join('\n')
    .replace(/^export /gm, '');

const logic = ['src/logic/geo.js', 'src/logic/riskScoring.js', 'src/logic/routeDeviation.js', 'src/logic/tripMonitoring.js']
  .map(inlineModule)
  .join('\n');

const data = `
const INCIDENT_ZONES = ${json('src/data/incident_zones.json')};
const SAFE_PLACES = ${json('src/data/safe_places.json')};
const DEMO_ROUTES = ${json('src/data/demo_routes.json')};
const DEMO_USERS = ${json('src/data/demo_users.json')};
`;

const app = read('tools/standalone-app.js');
const styles = read('src/styles.css');
const extraStyles = read('tools/standalone.css');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Sentinel</title>
<style>
${styles}
${extraStyles}
</style>
</head>
<body>
<div id="root"></div>
<script>
${data}
${logic}
${app}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'standalone.html'), html);
console.log('wrote standalone.html');
