import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class AssignTicketDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  teamId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentId?: number | null;
}
