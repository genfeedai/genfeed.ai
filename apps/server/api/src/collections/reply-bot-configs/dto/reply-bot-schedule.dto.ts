import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class ReplyBotScheduleDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether schedule-based activation is enabled',
    required: false,
  })
  enabled?: boolean;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:MM format',
  })
  @IsOptional()
  @ApiProperty({
    default: '09:00',
    description: 'Start time in HH:MM format',
    example: '09:00',
    required: false,
  })
  startTime?: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:MM format',
  })
  @IsOptional()
  @ApiProperty({
    default: '17:00',
    description: 'End time in HH:MM format',
    example: '17:00',
    required: false,
  })
  endTime?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'America/Los_Angeles',
    description: 'Timezone for schedule',
    example: 'America/New_York',
    required: false,
  })
  timezone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    description: 'Days when bot is active',
    example: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    required: false,
    type: [String],
  })
  activeDays?: string[];
}
