import { jwtSecret } from '../security/security.config';

export const jwtConstants = {
  secret: jwtSecret(),
};
