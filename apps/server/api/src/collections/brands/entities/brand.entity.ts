import {
  Brand,
  type BrandAgentConfig,
} from '@api/collections/brands/schemas/brand.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { AssetScope } from '@genfeedai/enums';
import { Types } from 'mongoose';

// @ts-expect-error - BrandEntity implements Brand via BaseEntity + explicit fields
export class BrandEntity extends BaseEntity implements Brand {
  declare readonly user: Types.ObjectId;
  declare readonly organization: Types.ObjectId;

  declare readonly logo?: Types.ObjectId;
  declare readonly banner?: Types.ObjectId;

  declare readonly voice?: Types.ObjectId;
  declare readonly music?: Types.ObjectId;

  declare readonly slug: string;
  declare readonly label: string;
  declare readonly description: string;
  declare readonly text?: string; // system prompt for the brand
  declare readonly fontFamily: string;

  declare readonly primaryColor: string;
  declare readonly secondaryColor: string;
  declare readonly backgroundColor: string;

  declare readonly defaultVideoModel?: string;
  declare readonly defaultImageModel?: string;
  declare readonly defaultImageToVideoModel?: string;
  declare readonly defaultMusicModel?: string;

  declare readonly isSelected: boolean;

  declare readonly agentConfig?: BrandAgentConfig;

  scope!: AssetScope;

  // Indicates if the brand is active and should be billed monthly
  isActive!: boolean;
  declare readonly isHighlighted: boolean;
}
