import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { TicketRoutingStrategy } from '../../../generated/prisma/client';

export class UpdateTicketRoutingDto {
  @IsBoolean()
  enabled!: boolean;

  @IsEnum(TicketRoutingStrategy)
  strategy!: TicketRoutingStrategy;
}

export class UpdateCategorySpecialtiesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  specialtyIds!: number[];
}
