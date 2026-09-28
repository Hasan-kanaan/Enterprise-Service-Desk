import { IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';
import { TeamScope } from '../../../generated/prisma/client';

export class ChangeTeamCoverageDto {
  @IsEnum(TeamScope)
  scope!: TeamScope;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  regionId?: number | null;
}
