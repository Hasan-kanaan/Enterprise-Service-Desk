import { IsInt, IsOptional, Min, ValidateIf, IsISO8601 } from 'class-validator';

export class AssignTicketDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  teamId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentId?: number | null;
}
