import { IsEnum, IsOptional } from 'class-validator';
import { UserRole, UserStatus } from '../../../generated/prisma/client';
import { ListQuery } from '../../common/list-query';

export class ListUsersDto extends ListQuery {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
