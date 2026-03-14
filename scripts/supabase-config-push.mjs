import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const targets = {
  dev: {
    projectRef: 'nkzsjyzhpvivfgslzltn',
    configFile: path.join(repoRoot, 'supabase', 'config.dev.toml'),
  },
  prod: {
    projectRef: 'ajbpzueanpeukozjhkiv',
    configFile: path.join(repoRoot, 'supabase', 'config.prod.toml'),
  },
};

const targetName = (process.argv[2] || '').toLowerCase();
const target = targets[targetName];
if (!target) {
  console.error('Usage: node scripts/supabase-config-push.mjs <dev|prod>');
  process.exit(1);
}

const activeConfigPath = path.join(repoRoot, 'supabase', 'config.toml');
if (!fs.existsSync(activeConfigPath)) {
  console.error(`Missing file: ${activeConfigPath}`);
  process.exit(1);
}
if (!fs.existsSync(target.configFile)) {
  console.error(`Missing file: ${target.configFile}`);
  process.exit(1);
}

const originalConfig = fs.readFileSync(activeConfigPath, 'utf8');
const targetConfig = fs.readFileSync(target.configFile, 'utf8');
const needsSwap = originalConfig !== targetConfig;

try {
  if (needsSwap) {
    fs.writeFileSync(activeConfigPath, targetConfig, 'utf8');
    console.log(`Applied ${path.basename(target.configFile)} to supabase/config.toml`);
  } else {
    console.log(`supabase/config.toml already matches ${path.basename(target.configFile)}`);
  }

  const result = spawnSync(
    'npx',
    ['supabase', 'config', 'push', '--project-ref', target.projectRef],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  process.exit(1);
} finally {
  if (needsSwap) {
    fs.writeFileSync(activeConfigPath, originalConfig, 'utf8');
    console.log('Restored original supabase/config.toml');
  }
}
