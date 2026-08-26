import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowPhase,
} from '@api/workflows/agent-workflows.types';
import { UpdateAgentWorkflowStateDto } from '@api/workflows/dto/update-agent-workflow-state.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

export const AGENT_WORKFLOW_PATCH_EVENTS = [
  'advance',
  'approve',
  'rollback',
] as const;

export type AgentWorkflowPatchEvent =
  (typeof AGENT_WORKFLOW_PATCH_EVENTS)[number];

const STATE_SNAPSHOT_FIELDS = [
  'approaches',
  'isLocked',
  'messages',
  'questions',
  'selectedApproachId',
  'verificationEvidence',
] as const satisfies ReadonlyArray<keyof UpdateAgentWorkflowStateDto>;

function carriesStateSnapshot(dto: PatchAgentWorkflowDto): boolean {
  return STATE_SNAPSHOT_FIELDS.some((field) => dto[field] !== undefined);
}

export function getAgentWorkflowPatchValidationError(
  dto: PatchAgentWorkflowDto,
): string | null {
  if (!AGENT_WORKFLOW_PATCH_EVENTS.includes(dto.event)) {
    return 'Unsupported agent workflow event';
  }

  if (dto.event !== 'rollback' && dto.targetPhase !== undefined) {
    return 'targetPhase is only allowed for rollback events';
  }

  if (dto.event !== 'advance' && dto.force !== undefined) {
    return 'force is only allowed for advance events';
  }

  if (dto.event === 'rollback') {
    if (dto.targetPhase === undefined) {
      return 'targetPhase is required for rollback events';
    }

    if (carriesStateSnapshot(dto)) {
      return 'Rollback events cannot carry workflow state snapshot fields';
    }
  }

  if (dto.event === 'advance' && dto.force === true) {
    if (carriesStateSnapshot(dto)) {
      return 'Forced advance events cannot carry workflow state snapshot fields';
    }
  }

  return null;
}

@ValidatorConstraint({ name: 'agentWorkflowPatchPayload', async: false })
class AgentWorkflowPatchPayloadConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: AgentWorkflowPatchEvent, args: ValidationArguments) {
    return (
      getAgentWorkflowPatchValidationError(
        args.object as PatchAgentWorkflowDto,
      ) === null
    );
  }

  defaultMessage(args: ValidationArguments) {
    return (
      getAgentWorkflowPatchValidationError(
        args.object as PatchAgentWorkflowDto,
      ) ?? 'Invalid agent workflow patch payload'
    );
  }
}

export class PatchAgentWorkflowDto extends UpdateAgentWorkflowStateDto {
  @IsIn(AGENT_WORKFLOW_PATCH_EVENTS)
  @Validate(AgentWorkflowPatchPayloadConstraint)
  @ApiProperty({ enum: AGENT_WORKFLOW_PATCH_EVENTS })
  event!: AgentWorkflowPatchEvent;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Bypass gate checks when advancing',
    type: Boolean,
  })
  force?: boolean;

  @IsOptional()
  @IsIn(AGENT_WORKFLOW_PHASES)
  @ApiPropertyOptional({
    description: 'Required destination phase for rollback events',
    enum: AGENT_WORKFLOW_PHASES,
  })
  targetPhase?: AgentWorkflowPhase;
}
