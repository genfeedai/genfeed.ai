import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCaptionDto extends PartialType(CreateCaptionDto) {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The caption content (SRT format text)',
    required: false,
  })
  readonly content?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the caption is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
