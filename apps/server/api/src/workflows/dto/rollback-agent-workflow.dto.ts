import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowPhase,
} from '@api/workflows/agent-workflows.types';
import { IsIn, IsNotEmpty } from 'class-validator';

export class RollbackAgentWorkflowDto {
  @IsIn(AGENT_WORKFLOW_PHASES)
  @IsNotEmpty()
  targetPhase!: AgentWorkflowPhase;
}
