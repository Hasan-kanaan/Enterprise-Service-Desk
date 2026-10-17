import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { DRAFT_DESCRIPTION_MAX } from './ticket-assistance.contract';

export class TicketAssistanceDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MaxLength(DRAFT_DESCRIPTION_MAX)
  description!: string;
}
