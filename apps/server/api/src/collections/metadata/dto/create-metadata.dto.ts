import { IsModelKeyOrTraining } from '@api/helpers/validators/model-key-or-training.validator';
import { MetadataExtension, MetadataStyle } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateMetadataDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly prompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Required if model is not provided',
    required: false,
  })
  readonly assistant!: string;

  @Transform(({ value }) =>
    value === '' || value === undefined ? null : value,
  )
  @ValidateIf((dto) => dto.model != null && dto.model !== '')
  @IsModelKeyOrTraining({
    message: 'Invalid model: must be ModelKey or genfeedai/<id>',
  })
  @IsOptional()
  @ApiProperty({
    description: 'Required if assistant is not provided',
    required: false,
  })
  readonly model?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ default: '', required: false })
  readonly result!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly error?: string;

  @Transform(({ value }) =>
    value === '' || value === undefined ? null : value,
  )
  @ValidateIf((dto) => dto.style != null && dto.style !== '')
  @IsEnum(MetadataStyle)
  @IsOptional()
  @ApiProperty({
    enum: Object.values(MetadataStyle),
    enumName: 'MetadataStyle',
    required: false,
  })
  readonly style?: MetadataStyle | null;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'Default Label',
    required: false,
  })
  readonly label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'Default Description',
    required: false,
  })
  readonly description?: string;

  @IsString()
  @IsEnum(MetadataExtension)
  @ApiProperty({
    default: MetadataExtension.JPEG,
    enum: MetadataExtension,
    enumName: 'MetadataExtension',
  })
  readonly extension!: MetadataExtension;

  @IsString()
  @IsOptional()
  readonly externalId?: string;

  @IsNumber()
  @IsOptional()
  readonly width?: number;

  @IsNumber()
  @IsOptional()
  readonly height?: number;

  @IsNumber()
  @IsOptional()
  readonly duration?: number;

  @IsNumber()
  @IsOptional()
  readonly size?: number;

  @IsBoolean()
  @IsOptional()
  readonly hasAudio?: boolean;

  @IsOptional()
  readonly tags?: string[];
}
