import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateAlignmentRuleDto {
  @IsString()
  @ApiProperty({ description: 'Unique key for the alignment rule' })
  readonly key!: string;

  @IsString()
  @ApiProperty({ description: 'Human-readable rule label' })
  readonly label!: string;

  @IsString()
  @ApiProperty({ description: 'Canonical rule definition' })
  readonly definition!: string;

  @IsString()
  @ApiProperty({ description: 'Rule owner (team or person)' })
  readonly owner!: string;

  @IsIn(['draft', 'approved', 'deprecated'])
  @IsOptional()
  @ApiProperty({
    description: 'Lifecycle status',
    enum: ['draft', 'approved', 'deprecated'],
    required: false,
  })
  readonly status?: 'draft' | 'approved' | 'deprecated';

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Optional notes', required: false })
  readonly notes?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ description: 'Rule effective date (ISO)', required: false })
  readonly effectiveDate?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({
    description: 'Last reviewed timestamp (ISO)',
    required: false,
  })
  readonly lastReviewedAt?: string;
}
