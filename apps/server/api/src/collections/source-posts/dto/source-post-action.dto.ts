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

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiProperty({ required: false })
  text?: string;
}

export class SourcePostTwitterActionDto {
  @IsEnum(SourcePostActionType)
  @ApiProperty({
    enum: [SourcePostActionType.REPLY, SourcePostActionType.QUOTE],
    enumName: 'SourcePostTwitterActionType',
  })
  actionType!: SourcePostActionType.REPLY | SourcePostActionType.QUOTE;

  @IsString()
  @MaxLength(280)
  @ApiProperty({ maxLength: 280 })
  text!: string;
}
