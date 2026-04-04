import { CreateAlignmentRuleDto } from '@api/endpoints/admin/crm/dto/create-alignment-rule.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateAlignmentRuleDto extends PartialType(
  CreateAlignmentRuleDto,
) {}
