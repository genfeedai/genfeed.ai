import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateAgentStrategyDto extends PartialType(
  CreateAgentStrategyDto,
) {}
