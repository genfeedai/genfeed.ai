import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { NativeSocialAction } from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RefreshSocialTimelineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  credentialId?: string;
}

export class SourcePostNativeActionDto {
  @ApiProperty({ enum: ['like', 'reply', 'repost', 'quote', 'comment'] })
  @IsIn(['like', 'reply', 'repost', 'quote', 'comment'])
  action!: NativeSocialAction;

  @ApiProperty()
  @IsEntityId()
  credentialId!: string;

  @ApiProperty()
  @IsUUID()
  idempotencyKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}
