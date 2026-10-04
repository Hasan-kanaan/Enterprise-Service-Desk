import { UserRole } from '../../generated/prisma/client';
import { manageableRoles } from './account-authority';

describe('account target authority', () => {
  it.each(Object.values(UserRole))(
    '%s has only its permitted target roles',
    (role) => {
      const expected =
        role === 'SUPER_ADMIN'
          ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
          : role === 'ADMIN'
            ? ['MANAGER', 'AGENT', 'EMPLOYEE']
            : [];
      expect(manageableRoles(role)).toEqual(expected);
      expect(manageableRoles(role)).not.toContain('SUPER_ADMIN');
    },
  );
});
