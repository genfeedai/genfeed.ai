import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLeadActivityDto {
  @IsString()
  @ApiProperty({ description: 'Activity type (note, email, call, meeting)' })
  readonly type!: string;

  @IsString()
  @ApiProperty({ description: 'Activity description' })
  readonly description!: string;

  @IsOptional()
  @ApiProperty({
    description: 'Arbitrary metadata for this activity',
    required: false,
    type: Object,
  })
  readonly metadata?: Record<string, unknown>;
}
