import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowActor,
  type AgentWorkflowApproach,
  type AgentWorkflowEvidence,
  type AgentWorkflowMessage,
  type AgentWorkflowPhase,
  type AgentWorkflowQuestion,
} from '@api/workflows/agent-workflows.types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const AGENT_WORKFLOW_QUESTION_TYPES = ['multiple_choice', 'free_text'] as const;
const AGENT_WORKFLOW_EVIDENCE_TYPES = [
  'test_result',
  'screenshot',
  'log',
  'diff',
] as const;
const AGENT_WORKFLOW_ROLES: AgentWorkflowActor[] = ['user', 'agent'];

class AgentWorkflowTradeoffsDto {
  @IsArray()
  @IsString({ each: true })
  pros!: string[];

  @IsArray()
  @IsString({ each: true })
  cons!: string[];
}

class AgentWorkflowQuestionDto implements AgentWorkflowQuestion {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsIn(AGENT_WORKFLOW_QUESTION_TYPES)
  type!: 'multiple_choice' | 'free_text';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  answer?: string;
}

class AgentWorkflowApproachDto implements AgentWorkflowApproach {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsBoolean()
  recommended!: boolean;

  @ValidateNested()
  @Type(() => AgentWorkflowTradeoffsDto)
  tradeoffs!: AgentWorkflowTradeoffsDto;
}

class AgentWorkflowEvidenceDto implements AgentWorkflowEvidence {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsIn(AGENT_WORKFLOW_EVIDENCE_TYPES)
  type!: 'test_result' | 'screenshot' | 'log' | 'diff';

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsBoolean()
  passed!: boolean;
}

class AgentWorkflowMessageDto implements AgentWorkflowMessage {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsIn(AGENT_WORKFLOW_PHASES)
  phase!: AgentWorkflowPhase;

  @IsIn(AGENT_WORKFLOW_ROLES)
  role!: AgentWorkflowActor;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsNumber()
  timestamp!: number;
}

export class UpdateAgentWorkflowStateDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentWorkflowQuestionDto)
  questions?: AgentWorkflowQuestion[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentWorkflowApproachDto)
  approaches?: AgentWorkflowApproach[];

  @IsOptional()
  @IsString()
  selectedApproachId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentWorkflowEvidenceDto)
  verificationEvidence?: AgentWorkflowEvidence[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentWorkflowMessageDto)
  messages?: AgentWorkflowMessage[];

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}
