const PROD_SUPABASE_URL = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const PROD_SUPABASE_KEY = 'sb_publishable_efac8Xr0Gyfy1J6uFt_X1Q_Z5hB1pe9';

const DEV_SUPABASE_URL = 'https://nkzsjyzhpvivfgslzltn.supabase.co';
const DEV_SUPABASE_KEY = 'sb_publishable_lHFJ9uxG0ZgkCeONR3PXyA_Jf8Lx_p_';

const hostname = (window.location.hostname || '').toLowerCase();
const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
// isDevHost: reserved for future dev-prefixed staging domains (e.g. dev.example.com)
const isDevHost = hostname === 'dev' || hostname.startsWith('dev.') || hostname.startsWith('dev-');
const ENV_OVERRIDE_KEY = 'jct.env.override';
const envParam = (new URLSearchParams(window.location.search).get('env') || '').toLowerCase();

if (envParam === 'dev' || envParam === 'prod') {
  try {
    window.localStorage.setItem(ENV_OVERRIDE_KEY, envParam);
  } catch {}
} else if (envParam === 'auto') {
  try {
    window.localStorage.removeItem(ENV_OVERRIDE_KEY);
  } catch {}
}

let persistedOverride = '';
try {
  persistedOverride = (window.localStorage.getItem(ENV_OVERRIDE_KEY) || '').toLowerCase();
} catch {}

const effectiveOverride = envParam === 'dev' || envParam === 'prod'
  ? envParam
  : (persistedOverride === 'dev' || persistedOverride === 'prod' ? persistedOverride : '');

export const effectiveEnv = effectiveOverride || ((isLocalHost || isDevHost) ? 'dev' : 'prod');

const localDevUrlOverride = window.localStorage.getItem('jct.dev.supabase.url');
const localDevKeyOverride = window.localStorage.getItem('jct.dev.supabase.key');

export const supabaseUrl = effectiveEnv === 'dev'
  ? (localDevUrlOverride || DEV_SUPABASE_URL || PROD_SUPABASE_URL)
  : PROD_SUPABASE_URL;

export const supabaseKey = effectiveEnv === 'dev'
  ? (localDevKeyOverride || DEV_SUPABASE_KEY || PROD_SUPABASE_KEY)
  : PROD_SUPABASE_KEY;

export const VERSION_DATE = '2026-04-08';
export const VERSION_INCREMENT = '03';
export const BUILD_ID = `${VERSION_DATE}-r${VERSION_INCREMENT}`;

if (effectiveEnv === 'dev' && !localDevKeyOverride) {
  console.info('DEBUG dev env active using remote dev Supabase project defaults.');
}

console.log('DEBUG env:', effectiveEnv, 'supabase:', supabaseUrl);

// Fonction pour récupérer la version automatiquement
export const getVersion = () => {
  return `-r`;
};
