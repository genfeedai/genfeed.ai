import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { SourcePostActionType } from '@genfeedai/contracts';
import { MAX_LISTENING_ATTRIBUTION_EVIDENCE_IDS } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  @IsOptional()
  @IsEntityId()
  @ApiProperty({ required: false })
  listeningTopicId?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({ required: false })
  listeningThemeId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LISTENING_ATTRIBUTION_EVIDENCE_IDS)
  @ArrayUnique()
  @IsEntityId({ each: true })
  @ApiProperty({ required: false, type: [String] })
  listeningEvidenceIds?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({ required: false })
  text?: string;
}
