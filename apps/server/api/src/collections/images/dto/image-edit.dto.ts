import { ImageFormat, UpscaleFactor } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';

export class ImageEditDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Model to use for image editing',
    required: false,
  })
  readonly model?: string;

  @IsString()
  @IsOptional()
  @IsEnum([
    'Standard V2',
    'Low Resolution V2',
    'CGI',
    'High Fidelity V2',
    'Text Refine',
  ])
  @ApiProperty({
    default: 'Low Resolution V2',
    description: 'Enhancement model for upscaling',
    enum: [
      'Standard V2',
      'Low Resolution V2',
      'CGI',
      'High Fidelity V2',
      'Text Refine',
    ],
    required: false,
  })
  readonly enhanceModel?: string;

  @IsString()
  @IsOptional()
  @IsEnum(ImageFormat)
  @ApiProperty({
    default: ImageFormat.JPG,
    description: 'Output format for edited image',
    enum: ImageFormat,
    enumName: 'ImageFormat',
    required: false,
  })
  readonly outputFormat?: ImageFormat;

  @IsString()
  @IsOptional()
  @IsEnum(UpscaleFactor)
  @ApiProperty({
    default: UpscaleFactor._4X,
    description: 'Upscale factor',
    enum: UpscaleFactor,
    enumName: 'UpscaleFactor',
    required: false,
  })
  readonly upscaleFactor?: UpscaleFactor;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Enable face enhancement',
    required: false,
  })
  readonly faceEnhancement?: boolean;

  @IsString()
  @IsOptional()
  @IsEnum(['Foreground', 'Background', 'All', 'None '])
  @ApiProperty({
    default: 'Foreground',
    description: 'Subject detection mode',
    enum: ['Foreground', 'Background', 'All', 'None'],
    required: false,
  })
  readonly subjectDetection?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  @ApiProperty({
    default: 0.8,
    description: 'Face enhancement strength',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  readonly faceEnhancementStrength?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  @ApiProperty({
    default: 0.5,
    description: 'Face enhancement creativity',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  readonly faceEnhancementCreativity?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(10)
  @ApiProperty({
    default: 1,
    description: 'Number of outputs to generate',
    maximum: 10,
    minimum: 1,
    required: false,
  })
  readonly outputs?: number;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Account ID for the image',
    required: false,
  })
  readonly brand?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization ID for the image',
    required: false,
  })
  readonly organization?: Types.ObjectId;
}
