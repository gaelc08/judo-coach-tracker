import { readFileSync, writeFileSync } from 'node:fs';
const envPath = 'public/modules/env.js';
const swPath = 'public/sw.js';
const indexPath = 'public/index.html';

function getLocalDateString() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function replaceOrThrow(content, pattern, replacer, label) {
  if (!pattern.test(content)) {
    throw new Error(`Unable to update ${label}.`);
  }
  return content.replace(pattern, replacer);
}

const today = getLocalDateString();
let envContent = readFileSync(envPath, 'utf8');

const currentDateMatch = envContent.match(/export const VERSION_DATE = '([0-9]{4}-[0-9]{2}-[0-9]{2})';/);
const currentIncrementMatch = envContent.match(/export const VERSION_INCREMENT = '([0-9]+)';/);

if (!currentDateMatch || !currentIncrementMatch) {
  throw new Error('Unable to read current app version from public/modules/env.js.');
}

const currentDate = currentDateMatch[1];
const currentIncrement = currentIncrementMatch[1];
const width = Math.max(2, currentIncrement.length);
const nextIncrement = currentDate === today
  ? String(Number(currentIncrement) + 1).padStart(width, '0')
  : '01';
const nextBuildId = `${today}-r${nextIncrement}`;

envContent = replaceOrThrow(
  envContent,
  /export const VERSION_DATE = '[0-9]{4}-[0-9]{2}-[0-9]{2}';/,
  `export const VERSION_DATE = '${today}';`,
  'VERSION_DATE'
);
envContent = replaceOrThrow(
  envContent,
  /export const VERSION_INCREMENT = '[0-9]+';/,
  `export const VERSION_INCREMENT = '${nextIncrement}';`,
  'VERSION_INCREMENT'
);
writeFileSync(envPath, envContent, 'utf8');

let swContent = readFileSync(swPath, 'utf8');
const cacheMatch = swContent.match(/const CACHE_VERSION = 'judo-coach-pwa-v([0-9]+)';/);
if (!cacheMatch) {
  throw new Error('Unable to read CACHE_VERSION from public/sw.js.');
}
const nextCacheVersion = Number(cacheMatch[1]) + 1;
swContent = replaceOrThrow(
  swContent,
  /const CACHE_VERSION = 'judo-coach-pwa-v[0-9]+';/,
  `const CACHE_VERSION = 'judo-coach-pwa-v${nextCacheVersion}';`,
  'CACHE_VERSION'
);
swContent = replaceOrThrow(
  swContent,
  /const APP_BUILD_ID = '[^']+';/,
  `const APP_BUILD_ID = '${nextBuildId}';`,
  'APP_BUILD_ID'
);
writeFileSync(swPath, swContent, 'utf8');

let indexContent = readFileSync(indexPath, 'utf8');
indexContent = replaceOrThrow(
  indexContent,
  /<script type="module" src="app-modular\.js\?v=[0-9]{4}-[0-9]{2}-[0-9]{2}-r[0-9]+"><\/script>/,
  `<script type="module" src="app-modular.js?v=${nextBuildId}"></script>`,
  'index version query'
);
writeFileSync(indexPath, indexContent, 'utf8');

console.log(`Bumped app version to ${nextBuildId} and cache to v${nextCacheVersion}.`);