import { SourcePostActionType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({ required: false })
  text?: string;
}

export class SourcePostTwitterActionDto {
  @IsIn([
    SourcePostActionType.REPLY,
    SourcePostActionType.QUOTE,
    SourcePostActionType.REPOST,
  ])
  @ApiProperty({
    enum: [
      SourcePostActionType.REPLY,
      SourcePostActionType.QUOTE,
      SourcePostActionType.REPOST,
    ],
    enumName: 'SourcePostTwitterActionType',
  })
  actionType!:
    | SourcePostActionType.REPLY
    | SourcePostActionType.QUOTE
    | SourcePostActionType.REPOST;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiProperty({
    description:
      'Required for reply and quote. Optional/ignored for native repost.',
    maxLength: 280,
    required: false,
  })
  text?: string;
}
