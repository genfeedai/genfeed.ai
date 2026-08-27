import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class OutreachCampaignRateLimitsDto {
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Maximum replies per hour',
    required: false,
  })
  maxPerHour?: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  @IsOptional()
  @ApiProperty({
    default: 50,
    description: 'Maximum replies per day',
    required: false,
  })
  maxPerDay?: number;

  @IsNumber()
  @Min(30)
  @IsOptional()
  @ApiProperty({
    default: 60,
    description: 'Delay between replies in seconds',
    required: false,
  })
  delayBetweenRepliesSeconds?: number;
}
