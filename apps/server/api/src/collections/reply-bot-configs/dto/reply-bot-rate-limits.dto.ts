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

  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  @ApiProperty({ default: 5, maximum: 50, minimum: 0, required: false })
  maxDmsPerHour?: number;

  @IsNumber()
  @Min(0)
  @Max(200)
  @IsOptional()
  @ApiProperty({ default: 20, maximum: 200, minimum: 0, required: false })
  maxDmsPerDay?: number;

  @IsNumber()
  @Min(0)
  @Max(60)
  @IsOptional()
  @ApiProperty({ default: 5, maximum: 60, minimum: 0, required: false })
  cooldownMinutes?: number;
}
