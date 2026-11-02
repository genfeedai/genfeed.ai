import type {
  IContentPreviewExtendRequest,
  IContentPreviewMintRequest,
} from '@genfeedai/contracts/interfaces';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MintContentPreviewDto implements IContentPreviewMintRequest {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  postIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

export class ExtendContentPreviewDto implements IContentPreviewExtendRequest {
  @IsInt()
  @Min(1)
  @Max(90)
  extendByDays!: number;
}
