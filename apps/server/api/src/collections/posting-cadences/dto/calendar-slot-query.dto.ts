import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CalendarSlotQueryDto {
  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsDateString()
  @ApiProperty()
  readonly endDate!: string;

  @IsDateString()
  @ApiProperty()
  readonly startDate!: string;
}
