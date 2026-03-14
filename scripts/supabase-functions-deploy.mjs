import { spawnSync } from 'node:child_process';

const targets = {
  dev: 'nkzsjyzhpvivfgslzltn',
  prod: 'ajbpzueanpeukozjhkiv',
};

const targetName = (process.argv[2] || '').toLowerCase();
const projectRef = targets[targetName];
if (!projectRef) {
  console.error('Usage: node scripts/supabase-functions-deploy.mjs <dev|prod>');
  process.exit(1);
}

const functionsToDeploy = [
  { name: 'invite-coach', noVerifyJwt: true },
  { name: 'invite-admin', noVerifyJwt: true },
  { name: 'delete-coach-user', noVerifyJwt: true },
  { name: 'alert-admin', noVerifyJwt: false },
];

for (const fn of functionsToDeploy) {
  const args = ['supabase', 'functions', 'deploy', fn.name, '--project-ref', projectRef];
  if (fn.noVerifyJwt) {
    args.push('--no-verify-jwt');
  }

  console.log(`\nDeploying function: ${fn.name} -> ${targetName} (${projectRef})`);
  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error(`Failed deploying function: ${fn.name}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll functions deployed to ${targetName} (${projectRef}).`);
