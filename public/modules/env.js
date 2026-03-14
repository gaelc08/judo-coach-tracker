const PROD_SUPABASE_URL = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const PROD_SUPABASE_KEY = 'sb_publishable_efac8Xr0Gyfy1J6uFt_X1Q_Z5hB1pe9';

const DEV_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEV_SUPABASE_KEY = null;

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const envOverride = (new URLSearchParams(window.location.search).get('env') || '').toLowerCase();

export const effectiveEnv = envOverride === 'prod'
  ? 'prod'
  : ((envOverride === 'dev' || isLocalHost) ? 'dev' : 'prod');

const localDevUrlOverride = window.localStorage.getItem('jct.dev.supabase.url');
const localDevKeyOverride = window.localStorage.getItem('jct.dev.supabase.key');

export const supabaseUrl = effectiveEnv === 'dev'
  ? (localDevUrlOverride || DEV_SUPABASE_URL || PROD_SUPABASE_URL)
  : PROD_SUPABASE_URL;

export const supabaseKey = effectiveEnv === 'dev'
  ? (localDevKeyOverride || DEV_SUPABASE_KEY || PROD_SUPABASE_KEY)
  : PROD_SUPABASE_KEY;

export const BUILD_ID = '2026-03-13-features-2';

if (effectiveEnv === 'dev' && !localDevKeyOverride && !DEV_SUPABASE_KEY) {
  console.warn('DEBUG dev env active without jct.dev.supabase.key override; fallback key in use.');
}

console.log('DEBUG env:', effectiveEnv, 'supabase:', supabaseUrl);
