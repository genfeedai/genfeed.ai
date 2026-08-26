import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AnalyzeListeningTopicDto {
  @IsDateString()
  @ApiProperty({ description: 'Exclusive end of the current analysis window' })
  readonly currentWindowEnd!: string;

  @IsDateString()
  @ApiProperty({
    description: 'Inclusive start of the current analysis window',
  })
  readonly currentWindowStart!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiProperty({ default: 2, maximum: 100, minimum: 1, required: false })
  readonly minimumEvidencePerWindow?: number = 2;

  @IsDateString()
  @ApiProperty({
    description: 'Exclusive end of the previous comparison window',
  })
  readonly previousWindowEnd!: string;

  @IsDateString()
  @ApiProperty({
    description: 'Inclusive start of the previous comparison window',
  })
  readonly previousWindowStart!: string;
}
