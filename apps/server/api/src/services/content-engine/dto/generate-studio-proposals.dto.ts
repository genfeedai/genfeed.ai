import {
  STUDIO_PROPOSAL_MAX_COUNT,
  STUDIO_PROPOSAL_SURFACES,
  type StudioProposalSurface,
} from '@genfeedai/contracts/api-types/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateStudioProposalsDto {
  @IsIn(STUDIO_PROPOSAL_SURFACES)
  @ApiProperty({ enum: STUDIO_PROPOSAL_SURFACES })
  readonly surface!: StudioProposalSurface;

  @IsInt()
  @Min(1)
  @Max(STUDIO_PROPOSAL_MAX_COUNT)
  @IsOptional()
  @ApiProperty({
    maximum: STUDIO_PROPOSAL_MAX_COUNT,
    minimum: 1,
    required: false,
  })
  readonly count?: number;
}
