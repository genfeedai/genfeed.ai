import { BotLivestreamSessionStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class BotLivestreamSessionPatchDto {
  @IsEnum(BotLivestreamSessionStatus)
  @ApiProperty({
    description:
      'Target livestream session status. "active" starts the session ' +
      'when stopped, or resumes it when paused.',
    enum: BotLivestreamSessionStatus,
    enumName: 'BotLivestreamSessionStatus',
  })
  status!: BotLivestreamSessionStatus;
}
