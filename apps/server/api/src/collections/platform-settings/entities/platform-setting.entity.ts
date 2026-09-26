import { BaseEntity } from '@api/entities/base.entity';
import { type MarginInputMode, type PlatformSetting } from '@genfeedai/prisma';

export class PlatformSettingEntity
  extends BaseEntity
  implements PlatformSetting
{
  declare readonly key: string;
  declare readonly marginMultiplierGeneration: number;
  declare readonly marginMultiplierAgentChat: number;
  declare readonly marginInputMode: MarginInputMode;
  declare readonly typedDecisionProvider: string;
}
