import {
  Body,
  Controller,
  Get,
  Post,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthController } from '../auth/auth.controller';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { configureHttpSecurity } from './http-security';
import {
  jwtSecret,
  refreshCookieOptions,
  securityConfig,
} from './security.config';
import { RateLimiter } from './rate-limiter';
import type { Server } from 'node:http';

jest.mock('bcryptjs', () => {
  const actual = jest.requireActual<typeof bcrypt>('bcryptjs');
  return {
    ...actual,
    compare: jest.fn((password: string, hash: string) =>
      actual.compare(password, hash),
    ),
  };
});

@Controller('probe')
class ProbeController {
  @Get() read() {
    return { ok: true };
  }
  @Post() write(@Body() body: object) {
    return body;
  }
  @Get('database-error') databaseError() {
    throw new Error('SELECT password FROM User; C:/private/.env JWT=secret');
  }
  @Get('internal-error') internalError() {
    throw new InternalServerErrorException('Prisma internals and token=secret');
  }
}

describe('Application HTTP security baseline', () => {
  let app: NestExpressApplication<Server>;
  const hash = bcrypt.hashSync('CorrectPass123!', 10);
  const user = {
    id: 1,
    username: 'fixture',
    email: 'known@example.test',
    password: hash,
    status: 'ACTIVE',
    sessionVersion: 0,
    role: UserRole.EMPLOYEE,
  };
  const users = {
    findByEmail: jest.fn((email: string) =>
      Promise.resolve(
        email === user.email
          ? user
          : email === 'inactive@example.test'
            ? { ...user, status: 'INACTIVE' }
            : null,
      ),
    ),
    issueSession: jest.fn(() => Promise.resolve(user)),
    findRefreshToken: jest.fn(() => Promise.resolve(null)),
    revokeRefreshToken: jest.fn(() => Promise.resolve(undefined)),
    hasSuperAdmin: jest.fn(() => Promise.resolve(true)),
    createInitialSuperAdmin: jest.fn(() => Promise.resolve(null)),
  };
  const post = (path: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Origin', 'http://localhost:3000');
  async function createApplication(env: NodeJS.ProcessEnv = {}) {
    const module = await Test.createTestingModule({
      controllers: [AuthController, ProbeController],
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'test-only-explicit-secret' }),
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestExpressApplication<Server>>({
      bodyParser: false,
    });
    configureHttpSecurity(app, {
      NODE_ENV: 'test',
      RATE_LIMIT_LOGIN_MAX: '3',
      RATE_LIMIT_REFRESH_MAX: '2',
      RATE_LIMIT_SETUP_MAX: '2',
      ...env,
    });
    await app.init();
  }
  beforeEach(() => createApplication());
  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it('throttles failed logins with a bounded 429 and Retry-After; forwarded headers cannot bypass it', async () => {
    for (let i = 0; i < 3; i++)
      await post('/auth/login')
        .send({ email: 'unknown@example.test', password: 'wrong' })
        .expect(401);
    const denied = await post('/AUTH/LOGIN/')
      .set('X-Forwarded-For', '192.0.2.55')
      .send({ email: user.email, password: 'CorrectPass123!' })
      .expect(429);
    expect(denied.body).toEqual({
      statusCode: 429,
      message: 'Too many requests. Please wait and try again.',
    });
    expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
    const normal = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(normal.body).toEqual({ ok: true });
  });
  it('normal login preserves the safe public projection and local cookie contract', async () => {
    const response = await post('/auth/login')
      .send({ email: user.email, password: 'CorrectPass123!' })
      .expect(201);
    const body = response.body as { accessToken: string; user: object };
    expect(body.accessToken).toBeTruthy();
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'user']);
    expect(body.user).toEqual({
      id: 1,
      username: user.username,
      email: user.email,
      role: user.role,
    });
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toMatch(/Secure|Domain=/);
    const logout = await post('/auth/logout')
      .set('Cookie', cookie.split(';')[0])
      .expect(201);
    expect(String(logout.headers['set-cookie'])).toMatch(
      /HttpOnly; SameSite=Lax/,
    );
  });
  it('returns identical unknown, inactive and incorrect-password failures and performs bcrypt for each', async () => {
    const compare = jest.mocked(bcrypt.compare);
    compare.mockClear();
    const bodies: unknown[] = [];
    for (const email of [
      'missing@example.test',
      'inactive@example.test',
      user.email,
    ]) {
      const response = await post('/auth/login')
        .send({ email, password: 'wrong' })
        .expect(401);
      bodies.push(response.body);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(bodies[0]).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
      error: 'Unauthorized',
    });
    expect(compare).toHaveBeenCalledTimes(3);
  });
  it('allows exact local CORS with credentials and rejects unauthorized/null browser origins before handlers', async () => {
    const response = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    for (const origin of [
      'http://evil.test',
      'http://localhost:3000.evil.test',
      'null',
    ]) {
      const rejected = await request(app.getHttpServer())
        .get('/probe')
        .set('Origin', origin)
        .expect(403);
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    }
    await request(app.getHttpServer()).get('/probe').expect(200);
  });
  it.each(['login', 'refresh', 'logout', 'setup'])(
    'protects cookie/session endpoint %s with origin, referer or non-simple header',
    async (endpoint) => {
      const path = `/auth/${endpoint}`;
      await request(app.getHttpServer())
        .post(path)
        .set('Origin', 'https://evil.test')
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .type('form')
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set('Referer', 'not a URL')
        .set('X-Requested-With', 'service-desk')
        .expect(403);
      const allowed = await request(app.getHttpServer())
        .post(path)
        .set('Referer', 'http://localhost:3000/login')
        .send({});
      expect(allowed.status).not.toBe(403);
      const cli = await request(app.getHttpServer())
        .post(path)
        .set('X-Requested-With', 'service-desk')
        .send({});
      expect(cli.status).not.toBe(403);
    },
  );
  it.each(['refresh', 'setup'])(
    'limits %s independently before expensive work',
    async (endpoint) => {
      for (let i = 0; i < 2; i++)
        expect((await post(`/auth/${endpoint}`).send({})).status).not.toBe(429);
      await post(`/auth/${endpoint}`).send({}).expect(429);
    },
  );
  it('sets API headers without HSTS or HTTPS upgrades on local HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe')
      .expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(response.headers['content-security-policy']).not.toContain(
      'upgrade-insecure',
    );
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('sets HTTPS production HSTS and Secure cookies with matching logout attributes', async () => {
    await app.close();
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
    });
    await createApplication({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://desk.example.test',
    });
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://desk.example.test')
      .send({ email: user.email, password: 'CorrectPass123!' })
      .expect(201);
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000',
    );
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://desk.example.test',
    );
    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', 'https://desk.example.test')
      .set('Cookie', cookie.split(';')[0])
      .expect(201);
    expect(String(logout.headers['set-cookie'])).toMatch(
      /HttpOnly; Secure; SameSite=Lax/,
    );
  });
  it('applies the configurable general API budget independently of authentication inputs', async () => {
    await app.close();
    await createApplication({ RATE_LIMIT_API_MAX: '2' });
    await request(app.getHttpServer()).get('/probe').expect(200);
    await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(app.getHttpServer())
      .get('/probe')
      .set('X-Forwarded-For', '192.0.2.99')
      .expect(429);
  });
  it('rejects oversized/malformed bodies safely and accepts normal ticket/message-sized JSON', async () => {
    await request(app.getHttpServer())
      .post('/probe')
      .send({
        title: 'Ticket',
        description: 'x'.repeat(20000),
        content: 'x'.repeat(4000),
      })
      .expect(201);
    const large = await request(app.getHttpServer())
      .post('/probe')
      .send({ content: 'x'.repeat(102400) })
      .expect(413);
    expect(large.body).toEqual({
      statusCode: 413,
      message: 'Request body too large',
    });
    const malformed = await request(app.getHttpServer())
      .post('/probe')
      .type('json')
      .send('{"secret":"private",')
      .expect(400);
    expect(malformed.body).toEqual({
      statusCode: 400,
      message: 'Invalid request body',
    });
  });
  it('masks database/internal failure details and request URLs while retaining expected 4xx', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    for (const path of ['/probe/database-error', '/probe/internal-error']) {
      const response = await request(app.getHttpServer()).get(path).expect(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
    const missing = await request(app.getHttpServer())
      .get('/missing?token=secret')
      .expect(404);
    expect(JSON.stringify(missing.body)).not.toContain('secret');
  });
});

describe('Security configuration and limiter boundaries', () => {
  it('resets at the configured window and bounds memory without evicting active clients', () => {
    let now = 0;
    const limiter = new RateLimiter(1, () => now);
    const policy = { limit: 2, windowMs: 2000 };
    expect(limiter.consume('a', policy)).toBe(0);
    expect(limiter.consume('a', policy)).toBe(0);
    expect(limiter.consume('a', policy)).toBe(2);
    expect(limiter.consume('b', policy)).toBe(1);
    now = 1999;
    expect(limiter.consume('a', policy)).toBe(1);
    now = 2000;
    expect(limiter.consume('a', policy)).toBe(0);
    now = 4000;
    expect(limiter.consume('b', policy)).toBe(0);
  });
  it('validates production secrets, exact origins and numeric settings without echoing secret values', () => {
    for (const JWT_SECRET of [undefined, '', 'dev-secret-change-me', 'short'])
      expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET })).toThrow(
        'Production requires',
      );
    expect(
      jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) }),
    ).toBe('a'.repeat(32));
    for (const ALLOWED_ORIGINS of [
      '*',
      'null',
      'https://good.test/path',
      'https://user:pass@good.test',
      '',
    ])
      expect(() => securityConfig({ ALLOWED_ORIGINS })).toThrow();
    expect(() => securityConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => securityConfig({ RATE_LIMIT_LOGIN_MAX: '0' })).toThrow();
    expect(securityConfig({}).policies.login.limit).toBe(20);
  });
  it('preserves HttpOnly/path/Lax with Secure production and deliberate cross-site HTTPS opt-in', () => {
    expect(refreshCookieOptions({ NODE_ENV: 'production' })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth',
    });
    expect(
      refreshCookieOptions({
        NODE_ENV: 'production',
        REFRESH_COOKIE_SAME_SITE: 'none',
      }).sameSite,
    ).toBe('none');
    expect(() =>
      refreshCookieOptions({ REFRESH_COOKIE_SAME_SITE: 'none' }),
    ).toThrow();
  });
});
