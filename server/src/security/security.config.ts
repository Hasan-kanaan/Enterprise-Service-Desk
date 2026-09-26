import type { CookieOptions } from 'express';

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
  const production = env.NODE_ENV === 'production';
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
    origins,
    bodyLimit: positiveInteger(env, 'REQUEST_BODY_LIMIT_BYTES', 102400),
    maxKeys: positiveInteger(env, 'RATE_LIMIT_MAX_KEYS', 10000),
    policies: {
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
    (sameSite === 'none' && env.NODE_ENV !== 'production')
  )
    throw new Error('Invalid REFRESH_COOKIE_SAME_SITE');
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: sameSite as 'lax' | 'strict' | 'none',
    path: '/auth',
  };
}

export function jwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.JWT_SECRET;
  if (
    env.NODE_ENV === 'production' &&
    (!secret || secret.trim().length < 32 || secret === 'dev-secret-change-me')
  )
    throw new Error(
      'Production requires an explicit JWT_SECRET of at least 32 characters',
    );
  return secret || 'dev-secret-change-me';
}
