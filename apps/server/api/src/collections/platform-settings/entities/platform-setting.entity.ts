import { BaseEntity } from '@server/entities/base.entity';
import { type PlatformSetting } from '@genfeedai/prisma';

export class PlatformSettingEntity
  extends BaseEntity
  implements PlatformSetting
{
  declare readonly key: string;
  declare readonly marginMultiplier: number;
}
