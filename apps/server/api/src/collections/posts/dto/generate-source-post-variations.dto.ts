import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentIntelligencePlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class GenerateSourcePostVariationsDto {
  @ApiProperty({
    default: 3,
    description: 'Number of distinct post variations to generate',
    maximum: 10,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count: number = 3;

  @ApiProperty({
    description: 'Target platform for the generated variations',
    enum: ContentIntelligencePlatform,
    enumName: 'ContentIntelligencePlatform',
  })
  @IsEnum(ContentIntelligencePlatform)
  platform!: ContentIntelligencePlatform;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  postId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  sourcePostId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  sourceReferenceId?: string;

  @ApiProperty({
    description: 'Tenant-owned trend exposing the imported source reference',
    required: false,
  })
  @ValidateIf((dto: GenerateSourcePostVariationsDto) =>
    Boolean(dto.sourceReferenceId),
  )
  @IsEntityId()
  trendId?: string;
}
