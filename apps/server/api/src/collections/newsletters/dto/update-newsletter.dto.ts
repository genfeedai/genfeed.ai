import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateNewsletterDto extends PartialType(CreateNewsletterDto) {
  /**
   * Preferred state transitions via PATCH (replaces POST /:id/approve|publish).
   */
  @IsOptional()
  @IsIn(['approve', 'publish'])
  @ApiPropertyOptional({
    description:
      'Lifecycle action. `approve` or `publish` run the dedicated transition; omit for field updates.',
    enum: ['approve', 'publish'],
  })
  readonly action?: 'approve' | 'publish';
}
