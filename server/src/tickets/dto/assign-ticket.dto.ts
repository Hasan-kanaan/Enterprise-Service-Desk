import { IsInt, IsOptional, Min } from 'class-validator';

export class AssignTicketDto {
  @IsInt()
  @Min(1)
  teamId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentId?: number;
}