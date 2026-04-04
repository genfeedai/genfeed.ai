import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAgentWorkflowDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  linkedConversationId?: string;
}
