import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TeamScope } from '../../../generated/prisma/client';

export class CreateTeamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsEnum(TeamScope)
  scope!: TeamScope;

  @IsOptional()
  @IsInt()
  @Min(1)
  regionId?: number;
}
