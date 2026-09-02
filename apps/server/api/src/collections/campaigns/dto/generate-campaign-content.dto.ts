import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const MAX_CAMPAIGN_GENERATE_CREDENTIALS = 50;

/**
 * Compiles a Campaign brief into existing generation/release interfaces.
 * Does not publish. Public mutations take arrays — no singular twin.
 */
export class GenerateCampaignContentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CAMPAIGN_GENERATE_CREDENTIALS)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Connected credentials to fan out. Omit to use every connected account on the campaign brand.',
    isArray: true,
    required: false,
    type: String,
  })
  readonly credentialIds?: string[];

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Originating content run to stamp on generated posts',
    required: false,
  })
  readonly contentRunId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ required: false })
  readonly idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiProperty({
    description: 'Origin label stamped as post source (e.g. campaign, remix)',
    required: false,
  })
  readonly source?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Originating workflow execution to stamp as lineage',
    required: false,
  })
  readonly workflowExecutionId?: string;
}
