import { IsEnum, IsIn, ValidateIf } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/client';

export class ListTicketsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['true', 'false'])
  active?: string;
}

export class ListSubtasksDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['true', 'false'])
  currentWork?: string;
}
