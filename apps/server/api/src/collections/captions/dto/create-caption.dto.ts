import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CaptionFormat } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class CreateCaptionDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The ingredient ID that this caption belongs to',
    required: true,
  })
  readonly ingredient!: string;

  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'The language code for the caption (e.g., en, es, fr)',
    required: true,
  })
  readonly language!: string;

  // Generate by Whisper. not needed in the video creation body.
  // @IsString()
  // @ApiProperty({
  //   description: 'The caption content (SRT format text)',
  //   required: false,
  // })
  // readonly content!: string;

  @IsString()
  @IsEnum(CaptionFormat)
  @ApiProperty({
    default: CaptionFormat.SRT,
    description: 'The format of the caption file',
    enum: CaptionFormat,
    enumName: 'CaptionFormat',
    required: true,
  })
  readonly format!: CaptionFormat;
}
