import {
  NEWSLETTER_SEND_ACTIONS,
  type NewsletterSendAction,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ControlNewsletterSendDto {
  @IsIn(NEWSLETTER_SEND_ACTIONS)
  @ApiProperty({
    description: 'Pause, resume or cancel a send before it completes.',
    enum: NEWSLETTER_SEND_ACTIONS,
  })
  readonly action!: NewsletterSendAction;
}
