import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { SubtaskStatus } from '../../../generated/prisma/client';

export class UpdateSubtaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SubtaskStatus)
  status?: SubtaskStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedTeamId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAgentId?: number;
}