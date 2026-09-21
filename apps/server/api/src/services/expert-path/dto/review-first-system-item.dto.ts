import type { ExpertFirstSystemItemAction } from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReviewFirstSystemItemDto {
  @ApiProperty({
    description:
      'approve runs the item into the review queue, edit updates its topic or prompt, reject skips it.',
    enum: ['approve', 'edit', 'reject'],
  })
  @IsIn(['approve', 'edit', 'reject'])
  readonly action!: ExpertFirstSystemItemAction;

  @ApiPropertyOptional({ description: 'Edited topic for the item.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  readonly topic?: string;

  @ApiPropertyOptional({
    description: 'Edited generation prompt for the item.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  readonly prompt?: string;
}
