import type { IRemotionCompositionInput } from '@genfeedai/contracts/interfaces';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RenderRemotionCompositionDto implements IRemotionCompositionInput {
  @IsIn(['product-story'])
  compositionId!: string;

  @IsIn(['1'])
  version!: string;

  @IsString()
  @Length(1, 80)
  rendererVersion!: string;

  @IsString()
  @Length(1, 100)
  brandId!: string;

  @IsString()
  @Length(1, 128)
  requestId!: string;

  @IsString()
  @Length(1, 100)
  title!: string;

  @IsString()
  @Length(1, 60)
  brandName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Length(1, 160, { each: true })
  benefits!: string[];

  @IsString()
  @Length(1, 80)
  callToAction!: string;

  @IsIn(['portrait', 'landscape', 'square'])
  format!: 'portrait' | 'landscape' | 'square';

  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sourceVideoId?: string;
}
