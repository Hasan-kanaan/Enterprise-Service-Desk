import { IsEnum, NotEquals } from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';
export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  @NotEquals(UserRole.SUPER_ADMIN)
  role!: UserRole;
}
