import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentTransferDeliveryMode } from '@genfeedai/enums';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAgentTransferDto {
  @ApiProperty()
  @IsEntityId()
  sourceThreadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  destinationThreadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  destinationTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  destinationBrandId?: string;

  @ApiProperty()
  @IsEnum(AgentTransferDeliveryMode)
  deliveryMode!: AgentTransferDeliveryMode;

  @ApiProperty()
  @IsString()
  @MaxLength(12_000)
  content!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  idempotencyKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentCorrelationId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  selectedContext?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  artifactReferences?: AgentArtifactReference[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  artifactVersionPinIds?: string[];

  @ApiPropertyOptional({
    description: 'Required acknowledgement for SEND_AND_RUN.',
  })
  @IsOptional()
  @IsBoolean()
  explicitUserIntent?: boolean;

  /** Server-only correlation for a confirmed conversation card action. */
  @IsOptional()
  @IsString()
  sourceActionId?: string;
}
