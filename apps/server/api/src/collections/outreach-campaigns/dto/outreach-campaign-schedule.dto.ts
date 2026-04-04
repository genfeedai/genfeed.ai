import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class OutreachCampaignScheduleDto {
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'Start date and time for the campaign',
    required: false,
  })
  startAt?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'End date and time for the campaign',
    required: false,
  })
  endAt?: Date;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'America/Los_Angeles',
    description: 'Timezone for schedule',
    required: false,
  })
  timezone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    description: 'Days of the week to run the campaign',
    required: false,
  })
  activeDays?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: '09:00',
    description: 'Start time for daily activity (HH:mm)',
    required: false,
  })
  activeStartTime?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: '21:00',
    description: 'End time for daily activity (HH:mm)',
    required: false,
  })
  activeEndTime?: string;
}
