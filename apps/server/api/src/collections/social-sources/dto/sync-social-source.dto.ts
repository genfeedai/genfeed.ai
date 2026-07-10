import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SyncSocialSourceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ default: 25, maximum: 100, minimum: 1, required: false })
  limit?: number = 25;
}
