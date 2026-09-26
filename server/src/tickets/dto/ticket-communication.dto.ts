import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class EditCommunicationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  @IsInt()
  @Min(1)
  expectedCycleId!: number;
}

export class CreateCommunicationDto extends EditCommunicationDto {
  @IsUUID()
  clientRequestId!: string;
}

export class DeleteCommunicationDto {
  @IsInt()
  @Min(1)
  expectedCycleId!: number;
}
