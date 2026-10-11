import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  setupSecret!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsBoolean()
  restart?: boolean;
}
