import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Optional overrides when triggering a strategy-bound workflow.
 * Unset keys are filled deterministically from the strategy (topics, voice,
 * brand, platform) and workflow inputVariable defaults.
 */
export class RunAgentStrategyWorkflowDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Primary topic override (maps to topic / titleText / visualAngle keys).',
    required: false,
  })
  topic?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Prompt or script override (maps to prompt / script / angle keys).',
    required: false,
  })
  prompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Optional reference image URL or ingredient id for asset slots.',
    required: false,
  })
  referenceImage?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional CTA text override.',
    required: false,
  })
  cta?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    additionalProperties: true,
    description:
      'Raw inputValues merged last (exact workflow inputVariable keys).',
    required: false,
    type: Object,
  })
  inputs?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Override preferred workflow id for this run only (must belong to org).',
    required: false,
  })
  workflowId?: string;
}

/** Response shape for preview + run endpoints (serialized as plain JSON). */
export interface AgentStrategyWorkflowInputPreview {
  defaultValue: unknown;
  description: string | null;
  filledValue: unknown;
  key: string;
  label: string;
  required: boolean;
  source: 'default' | 'override' | 'strategy' | 'unfilled';
  type: string;
}

export interface AgentStrategyWorkflowBindingPreview {
  inputs: AgentStrategyWorkflowInputPreview[];
  missingRequiredKeys: string[];
  preferredWorkflowId: string | null;
  preferredWorkflowTemplateId: string | null;
  templateDescription: string | null;
  workflowId: string | null;
  workflowLabel: string | null;
}

export interface AgentStrategyWorkflowRunResult {
  executionId: string;
  filledInputs: Record<string, unknown>;
  missingRequiredKeys: string[];
  status: string;
  workflowId: string;
  workflowLabel: string | null;
}
