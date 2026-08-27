import { CreateEngagementRuleDto } from '@api/collections/engagement-rules/dto/create-engagement-rule.dto';
import { OmitType, PartialType } from '@nestjs/swagger';

export class UpdateEngagementRuleDto extends PartialType(
  OmitType(CreateEngagementRuleDto, ['postGroupId', 'targetId'] as const),
) {}
