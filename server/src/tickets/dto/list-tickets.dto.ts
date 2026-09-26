import {
  IsEnum,
  IsIn,
  ValidateIf,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListQuery } from '../../common/list-query';
import { TicketStatus } from '../../../generated/prisma/client';

export class ListTicketsDto extends ListQuery {
  @IsOptional()
  @IsIn(['intake', 'mine', 'primary', 'collaboration', 'team'])
  queue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['true', 'false'])
  active?: string;
}

export class ListSubtasksDto extends ListQuery {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['true', 'false'])
  currentWork?: string;
}
