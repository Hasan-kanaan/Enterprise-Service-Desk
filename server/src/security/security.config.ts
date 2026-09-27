import type { CookieOptions } from 'express';
import { isIP } from 'node:net';

// Only explicitly named local modes may use development defaults.
export function deployedMode(env: NodeJS.ProcessEnv = process.env) {
  return !['development', 'test'].includes(env.NODE_ENV ?? '');
}

export function strongSecret(secret: string | undefined) {
  return (
    !!secret &&
    secret.trim().length >= 32 &&
    new Set(secret).size >= 12 &&
    !/dev-secret|change[-_ ]?me|example|placeholder/i.test(secret)
  );
}

export function initialSetupSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.INITIAL_SETUP_SECRET;
  if (!strongSecret(secret))
    throw new Error(
      'INITIAL_SETUP_SECRET requires a strong secret of at least 32 characters',
    );
  return secret!;
}

export function proxyTrust(
  env: NodeJS.ProcessEnv = process.env,
): false | number | string[] {
  const value = env.TRUST_PROXY?.trim();
  if (!value || value === 'false' || value === '0') return false;
  if (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))
    return Number(value);
  const networks = value.split(',').map((item) => item.trim());
  if (
    !networks.every((network) => {
      const [address, prefix, extra] = network.split('/');
      const version = isIP(address);
      return (
        version &&
        extra === undefined &&
        (prefix === undefined ||
          (/^\d+$/.test(prefix) &&
            Number(prefix) <= (version === 4 ? 32 : 128)))
      );
    })
  )
    throw new Error('TRUST_PROXY must be false, a hop count, or IP/CIDR list');
  return networks;
}

export function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`Invalid ${name}`);
  return value;
}

export function securityConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = deployedMode(env);
  const configured =
    env.ALLOWED_ORIGINS ?? (production ? '' : 'http://localhost:3000');
  const origins = configured.split(',').map((origin) => origin.trim());
  if (
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          !['http:', 'https:'].includes(url.protocol) ||
          (production && url.protocol !== 'https:')
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'ALLOWED_ORIGINS must contain exact HTTP(S) origins (HTTPS in production)',
    );
  const sameSite = env.REFRESH_COOKIE_SAME_SITE ?? 'lax';
  if (
    !['lax', 'strict', 'none'].includes(sameSite) ||
    (sameSite === 'none' && !production)
  )
    throw new Error(
      'Invalid REFRESH_COOKIE_SAME_SITE; none requires HTTPS production',
    );
  return {
    production,
    trustProxy: proxyTrust(env),
    origins,
    bodyLimit: positiveInteger(env, 'REQUEST_BODY_LIMIT_BYTES', 102400),
    maxKeys: positiveInteger(env, 'RATE_LIMIT_MAX_KEYS', 10000),
    policies: {
      recovery: {
        limit: positiveInteger(env, 'RATE_LIMIT_RECOVERY_MAX', 10),
        windowMs: 600000,
      },
      api: {
        limit: positiveInteger(env, 'RATE_LIMIT_API_MAX', 600),
        windowMs: positiveInteger(env, 'RATE_LIMIT_API_WINDOW_MS', 60000),
      },
      login: {
        limit: positiveInteger(env, 'RATE_LIMIT_LOGIN_MAX', 20),
        windowMs: positiveInteger(env, 'RATE_LIMIT_LOGIN_WINDOW_MS', 600000),
      },
      refresh: {
        limit: positiveInteger(env, 'RATE_LIMIT_REFRESH_MAX', 60),
        windowMs: positiveInteger(env, 'RATE_LIMIT_REFRESH_WINDOW_MS', 60000),
      },
      setup: {
        limit: positiveInteger(env, 'RATE_LIMIT_SETUP_MAX', 5),
        windowMs: positiveInteger(env, 'RATE_LIMIT_SETUP_WINDOW_MS', 600000),
      },
    },
  };
}

export function refreshCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  const sameSite = env.REFRESH_COOKIE_SAME_SITE ?? 'lax';
  if (
    !['lax', 'strict', 'none'].includes(sameSite) ||
    (sameSite === 'none' && !deployedMode(env))
  )
    throw new Error('Invalid REFRESH_COOKIE_SAME_SITE');
  return {
    httpOnly: true,
    secure: deployedMode(env),
    sameSite: sameSite as 'lax' | 'strict' | 'none',
    path: '/auth',
  };
}

export function jwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.JWT_SECRET;
  if (deployedMode(env) && !strongSecret(secret))
    throw new Error(
      'Production requires an explicit JWT_SECRET of at least 32 characters',
    );
  return secret || 'dev-secret-change-me';
}
