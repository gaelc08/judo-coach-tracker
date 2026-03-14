export function createAuthStorage() {
  const store = new Map();
  let persistentStorage = null;

  try {
    const probeKey = '__judo_coach_tracker_auth_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    persistentStorage = window.localStorage;
  } catch (_) {
    persistentStorage = null;
  }

  return {
    getItem: (key) => {
      try {
        const value = persistentStorage?.getItem(key);
        if (value != null) return value;
      } catch (_) {
        persistentStorage = null;
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem: (key, value) => {
      const normalized = String(value);
      try {
        persistentStorage?.setItem(key, normalized);
      } catch (_) {
        persistentStorage = null;
      }
      store.set(key, normalized);
    },
    removeItem: (key) => {
      try {
        persistentStorage?.removeItem(key);
      } catch (_) {
        persistentStorage = null;
      }
      store.delete(key);
    }
  };
}

export function createAuthNoHangLock({ logger = console } = {}) {
  return async (...args) => {
    const lockName = String(args?.[0] ?? '');
    const maybeFn = args[args.length - 1];
    const fn = (typeof maybeFn === 'function') ? maybeFn : null;
    const timeoutMs = (typeof args?.[1] === 'number' && args.length >= 3) ? args[1] : 2500;
    const startedAt = performance.now();

    if (!fn) {
      logger?.warn?.('DEBUG auth.lock called without fn', args);
      return undefined;
    }

    logger?.log?.('DEBUG auth.lock ->', lockName, `timeout=${timeoutMs}`);
    try {
      const fnPromise = Promise.resolve().then(() => fn());
      const timeoutToken = Symbol('auth.lock.timeout');
      const raced = await Promise.race([
        fnPromise,
        new Promise((resolve) => setTimeout(() => resolve(timeoutToken), timeoutMs))
      ]);

      if (raced === timeoutToken) {
        logger?.warn?.('DEBUG auth.lock TIMEOUT (returning undefined):', lockName);
        return undefined;
      }

      logger?.log?.('DEBUG auth.lock <-', lockName, `${Math.round(performance.now() - startedAt)}ms`);
      return raced;
    } catch (e) {
      logger?.error?.('DEBUG auth.lock error:', lockName, e);
      return undefined;
    }
  };
}

export function detectInviteFlowFromUrlHash(hashValue = window.location.hash) {
  try {
    const hashParams = new URLSearchParams(String(hashValue || '').replace(/^#/, ''));
    return hashParams.get('type') === 'invite';
  } catch {
    return false;
  }
}
