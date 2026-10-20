import { ASSISTED_X_REPLY_MAX_LENGTH } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OpenAssistedReplyDto {
  @IsString()
  @IsOptional()
  @MaxLength(ASSISTED_X_REPLY_MAX_LENGTH)
  @ApiProperty({
    description: 'Edited reply text; the saved draft is used when omitted',
    maxLength: ASSISTED_X_REPLY_MAX_LENGTH,
    required: false,
  })
  replyText?: string;
}
