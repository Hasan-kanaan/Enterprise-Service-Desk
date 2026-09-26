import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ReopenTicketDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  // Explicit recovery for invalid legacy routing, never inferred replacement routing.
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  returnToIntake?: boolean;
}
