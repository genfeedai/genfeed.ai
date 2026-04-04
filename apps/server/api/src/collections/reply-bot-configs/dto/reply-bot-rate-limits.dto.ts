import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ReplyBotRateLimitsDto {
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Maximum replies per hour',
    maximum: 50,
    minimum: 1,
    required: false,
  })
  maxRepliesPerHour?: number;

  @IsNumber()
  @Min(1)
  @Max(200)
  @IsOptional()
  @ApiProperty({
    default: 50,
    description: 'Maximum replies per day',
    maximum: 200,
    minimum: 1,
    required: false,
  })
  maxRepliesPerDay?: number;

  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  @ApiProperty({
    default: 5,
    description: 'Maximum replies per monitored account per day',
    maximum: 20,
    minimum: 1,
    required: false,
  })
  maxRepliesPerAccountPerDay?: number;
}
