import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SubtaskStatus } from '../../../generated/prisma/client';

export class UpdateSubtaskDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(SubtaskStatus)
  status?: SubtaskStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedTeamId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAgentId?: number | null;
}
