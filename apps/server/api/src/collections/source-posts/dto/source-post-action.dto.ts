import { SourcePostActionType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SourcePostDraftActionDto {
  @IsEnum(SourcePostActionType)
  @IsOptional()
  @ApiProperty({
    default: SourcePostActionType.DRAFT,
    enum: SourcePostActionType,
    enumName: 'SourcePostActionType',
    required: false,
  })
  actionType?: SourcePostActionType;

  /**
   * Which of the brand's accounts on this platform the draft publishes as.
   * Omitted resolves the brand's default account for the platform.
   */
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  credentialId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({ required: false })
  text?: string;
}
