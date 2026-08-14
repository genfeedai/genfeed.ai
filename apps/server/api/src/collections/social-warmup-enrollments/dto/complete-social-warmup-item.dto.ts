import { socialWarmupProvenanceValues } from '@api-types/contracts/social-warmup-blueprint.contract';
import type { SocialWarmupEventProvenance } from '@genfeedai/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class CompleteSocialWarmupItemDto {
  @ApiPropertyOptional({ enum: socialWarmupProvenanceValues })
  @IsOptional()
  @IsIn(socialWarmupProvenanceValues)
  provenance?: SocialWarmupEventProvenance;
}
