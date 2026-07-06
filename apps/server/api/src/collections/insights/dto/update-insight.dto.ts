import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Body for `PATCH /insights/:id`. Consolidates the former read/dismiss action
 * routes: both flags live inside the insight's `data` JSON blob.
 */
export class UpdateInsightDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the insight has been read.',
    required: false,
  })
  readonly isRead?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the insight has been dismissed.',
    required: false,
  })
  readonly isDismissed?: boolean;
}
