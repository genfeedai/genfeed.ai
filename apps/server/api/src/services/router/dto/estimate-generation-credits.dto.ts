import { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const ESTIMATE_CATEGORIES = [ModelCategory.IMAGE, ModelCategory.VIDEO] as const;
type EstimateCategory = (typeof ESTIMATE_CATEGORIES)[number];

/**
 * #4672 Manual-mode review card estimate request. `organizationId` is never
 * accepted here — the controller resolves it from the authenticated user so
 * a caller cannot price (or, worse, learn about) another organization's
 * enabled models.
 */
export class EstimateGenerationCreditsDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The prompt as the Agent wrote it',
    example: 'A futuristic city at sunset with flying cars',
  })
  readonly prompt!: string;

  @IsIn(ESTIMATE_CATEGORIES)
  @ApiProperty({
    description: 'Image or video — the two the docked review card supports',
    enum: ESTIMATE_CATEGORIES,
    example: ModelCategory.IMAGE,
  })
  readonly category!: EstimateCategory;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(60)
  @ApiProperty({
    description: 'Duration in seconds for video generation',
    maximum: 60,
    minimum: 1,
    required: false,
  })
  readonly duration?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(8)
  @ApiProperty({
    default: 1,
    maximum: 8,
    minimum: 1,
    required: false,
  })
  readonly outputs?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Video resolution option (e.g. "1080p", "4k")',
    required: false,
  })
  readonly resolution?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Image quality tier ("standard" | "hd")',
    required: false,
  })
  readonly quality?: string;
}
