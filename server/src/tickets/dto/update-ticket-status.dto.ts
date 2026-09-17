import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/client';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}