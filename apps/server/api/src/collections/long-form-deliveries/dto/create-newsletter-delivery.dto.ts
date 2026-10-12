import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  NEWSLETTER_DELIVERY_MODES,
  type NewsletterDeliveryMode,
} from '@genfeedai/contracts/constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, ValidateIf } from 'class-validator';

export class CreateNewsletterDeliveryDto {
  @ApiProperty({
    description:
      'Connected Beehiiv publication of the newsletter brand to deliver the issue to.',
  })
  @IsEntityId()
  readonly credentialId!: string;

  @ApiProperty({
    description:
      '`send` sends now, `draft` creates a Beehiiv draft, `schedule` sends at `scheduledDate`.',
    enum: NEWSLETTER_DELIVERY_MODES,
  })
  @IsIn(NEWSLETTER_DELIVERY_MODES)
  readonly mode!: NewsletterDeliveryMode;

  @ApiPropertyOptional({
    description:
      'ISO send time in the future. Required for `schedule`; ignored otherwise.',
  })
  @ValidateIf((dto: CreateNewsletterDeliveryDto) => dto.mode === 'schedule')
  @IsDateString()
  readonly scheduledDate?: string;
}
