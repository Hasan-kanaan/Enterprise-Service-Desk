import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TeamScope } from '../../../generated/prisma/client';

export class CreateTeamDto {
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