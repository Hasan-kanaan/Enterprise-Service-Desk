import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  ValidateIf,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/client';

export class UpdateTicketDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allRegions?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allDepartments?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  affectedRegionIds?: number[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  affectedDepartmentIds?: number[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tagIds?: number[];
}
