import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedTeamId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAgentId?: number | null;
}
