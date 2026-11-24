import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQuery } from '../../common/list-query';

export class ListUsersDto extends ListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  status?: string;
}
