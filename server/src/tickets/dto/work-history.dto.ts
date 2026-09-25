import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export const contributions = [
  'RESPONSIBLE_MANAGER',
  'PRIMARY_AGENT',
  'ENDED_WORK',
  'CLOSED_WORK',
  'REOPENED_WORK',
  'COMPLETED_SUBTASK',
] as const;
export class WorkHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @IsIn(contributions)
  contribution?: (typeof contributions)[number];

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
