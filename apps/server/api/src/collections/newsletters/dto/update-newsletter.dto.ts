import { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  @ApiPropertyOptional({
    description:
      'Live URL of the issue when it was sent outside Genfeed. Send null to clear it.',
    maxLength: 2048,
    nullable: true,
  })
  readonly externalUrl?: string | null;
}
