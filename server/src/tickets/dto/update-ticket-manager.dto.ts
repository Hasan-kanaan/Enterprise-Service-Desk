import { IsInt, Min } from 'class-validator';

export class UpdateTicketManagerDto {
  @IsInt()
  @Min(1)
  assignedManagerId!: number;
}
