import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/client';

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(1)
  categoryId!: number;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsBoolean()
  allRegions?: boolean;

  @IsOptional()
  @IsBoolean()
  allDepartments?: boolean;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  affectedRegionIds!: number[];

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  affectedDepartmentIds!: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tagIds?: number[];
}