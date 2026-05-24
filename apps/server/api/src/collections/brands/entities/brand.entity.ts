import {
  Brand,
  type BrandAgentConfig,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class BrandEntity extends BaseEntity implements Brand {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly organizationId: string;
  declare readonly user: string;
  declare readonly organization: string;
  declare readonly voiceIngredientId: string | null;
  declare readonly musicIngredientId: string | null;
  declare readonly isDefault: boolean;
  declare readonly isDarkroomEnabled: boolean;

  declare readonly logo?: string;
  declare readonly banner?: string;

  declare readonly voice?: string;
  declare readonly music?: string;

  declare readonly slug: string;
  declare readonly label: string;
  declare readonly description: string;
  declare readonly text: BrandDocument['text']; // system prompt for the brand
  declare readonly fontFamily: BrandDocument['fontFamily'];

  declare readonly primaryColor: BrandDocument['primaryColor'];
  declare readonly secondaryColor: BrandDocument['secondaryColor'];
  declare readonly backgroundColor: BrandDocument['backgroundColor'];

  declare readonly defaultVideoModel: BrandDocument['defaultVideoModel'];
  declare readonly defaultImageModel: BrandDocument['defaultImageModel'];
  declare readonly defaultImageToVideoModel: BrandDocument['defaultImageToVideoModel'];
  declare readonly defaultMusicModel: BrandDocument['defaultMusicModel'];

  declare readonly isSelected: boolean;

  declare readonly referenceImages: BrandDocument['referenceImages'];
  declare readonly agentConfig: BrandDocument['agentConfig'];

  scope!: BrandDocument['scope'];

  // Indicates if the brand is active and should be billed monthly
  isActive!: boolean;
  declare readonly isHighlighted: boolean;
}
