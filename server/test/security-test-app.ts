import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpSecurity } from '../src/security/http-security';

// Business regression fixtures deliberately issue thousands of requests on one IP.
// The dedicated HTTP security suite separately exercises small limits and defaults.
export function configureTestSecurity(app: NestExpressApplication) {
  configureHttpSecurity(app, {
    NODE_ENV: 'test',
    RATE_LIMIT_API_MAX: '100000',
    RATE_LIMIT_LOGIN_MAX: '100000',
    RATE_LIMIT_REFRESH_MAX: '100000',
    RATE_LIMIT_SETUP_MAX: '100000',
  });
}
