import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyKnowledgeController } from './company-knowledge.controller';

describe('CompanyKnowledgeController authorization', () => {
  const reflector = new Reflector();

  it.each(['retry', 'extractedText'])(
    'restricts %s to SUPER_ADMIN',
    (methodName) => {
      const handler =
        CompanyKnowledgeController.prototype[
          methodName as 'retry' | 'extractedText'
        ];
      expect(
        reflector.getAllAndOverride<string[]>(ROLES_KEY, [
          handler,
          CompanyKnowledgeController,
        ]),
      ).toEqual([UserRole.SUPER_ADMIN]);
    },
  );

  it('keeps authentication and role guards on the controller', () => {
    expect(
      Reflect.getMetadata('__guards__', CompanyKnowledgeController),
    ).toEqual([AuthGuard, RolesGuard]);
  });
});
