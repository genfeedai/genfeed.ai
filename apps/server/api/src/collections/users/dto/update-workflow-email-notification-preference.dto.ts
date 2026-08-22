import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateWorkflowEmailNotificationPreferenceDto {
  @IsBoolean()
  @ApiProperty({
    description: 'Send an email when an owned workflow completes or fails',
    required: true,
  })
  readonly isEnabled!: boolean;
}
