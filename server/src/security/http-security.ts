import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { RateLimiter } from './rate-limiter';
import { securityConfig } from './security.config';

@Catch()
export class SafeHttpErrors implements ExceptionFilter {
  private readonly logger = new Logger('HttpErrors');
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) {
      // Do not serialize error messages/stacks: drivers can embed SQL, paths or secrets.
      const req = host.switchToHttp().getRequest<Request>();
      const route = (req.route as { path?: unknown } | undefined)?.path;
      this.logger.error(
        `Unhandled server request failure: ${req.method} ${typeof route === 'string' ? route : '(unmatched route)'}`,
      );
      response
        .status(500)
        .json({ statusCode: 500, message: 'Internal server error' });
    } else if (
      status === 404 &&
      error instanceof Error &&
      error.message.startsWith('Cannot ')
    ) {
      response.status(404).json({ statusCode: 404, message: 'Not found' });
    } else {
      const body = (error as HttpException).getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
    }
  }
}

export function configureHttpSecurity(
  app: NestExpressApplication,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = securityConfig(env);
  app.set('trust proxy', false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
        },
      },
      xFrameOptions: { action: 'deny' },
      strictTransportSecurity: config.production
        ? { maxAge: 31536000, includeSubDomains: false }
        : false,
    }),
  );
  const deny = (res: Response) =>
    res
      .status(403)
      .json({ statusCode: 403, message: 'Request origin not allowed' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin !== undefined && !config.origins.includes(origin)) {
      deny(res);
      return;
    }
    next();
  });
  app.enableCors({
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Retry-After'],
  });
  const limiter = new RateLimiter(config.maxKeys);
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive and accepts a trailing slash by default.
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    const sensitive =
      req.method === 'POST' &&
      ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/setup'].includes(
        path,
      );
    if (sensitive && !req.get('Origin')) {
      const referer = req.get('Referer');
      let allowed = false;
      if (referer) {
        try {
          allowed = config.origins.includes(new URL(referer).origin);
        } catch {
          /* Reject malformed provenance. */
        }
      } else {
        // Non-simple header permits CLI clients without trusting spoofable browser detection.
        // A browser attacker must preflight it, which our exact allowlist rejects.
        allowed = req.get('X-Requested-With') === 'service-desk';
      }
      if (!allowed) {
        deny(res);
        return;
      }
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const policy =
      req.method === 'POST'
        ? (
            {
              '/auth/login': 'login',
              '/auth/refresh': 'refresh',
              '/auth/setup': 'setup',
            } as const
          )[path]
        : undefined;
    const retry =
      limiter.consume(`api:${ip}`, config.policies.api) ||
      (policy
        ? limiter.consume(`${policy}:${ip}`, config.policies[policy])
        : 0);
    if (retry) {
      res.setHeader('Retry-After', retry);
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests. Please wait and try again.',
      });
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: config.bodyLimit, inflate: false });
  app.useBodyParser('urlencoded', {
    limit: config.bodyLimit,
    extended: false,
    parameterLimit: 100,
    inflate: false,
  });
  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      const type = (error as { type?: string })?.type;
      if (
        [
          'entity.too.large',
          'entity.parse.failed',
          'encoding.unsupported',
          'parameters.too.many',
          'charset.unsupported',
        ].includes(type ?? '')
      ) {
        const status =
          type === 'entity.too.large' || type === 'parameters.too.many'
            ? 413
            : type === 'entity.parse.failed'
              ? 400
              : 415;
        res.status(status).json({
          statusCode: status,
          message:
            status === 413 ? 'Request body too large' : 'Invalid request body',
        });
        return;
      }
      next(error);
    },
  );
  app.use(cookieParser());
  app.useGlobalFilters(new SafeHttpErrors());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
