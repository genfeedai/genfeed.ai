import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';

export class SocialSuggestedReplyParamsDto {
  @IsEntityId()
  @ApiProperty({ description: 'Conversation to draft a reply for' })
  conversationId!: string;
}
