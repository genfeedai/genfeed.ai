import type {
  JsonApiCollectionResponse,
  JsonApiMeta,
} from '@genfeedai/interfaces';

export interface SkillsProRegistryEntryDto {
  category: string;
  description: string;
  id: string;
  name: string;
  slug: string;
  version: string;
}

export interface SkillsProRegistryEntryAttributes {
  category: string;
  description: string;
  name: string;
  slug: string;
  version: string;
}

export interface SkillsProRegistryMeta extends JsonApiMeta {
  bundlePrice: number;
  updatedAt: string;
}

export interface SkillsProRegistryResponse
  extends JsonApiCollectionResponse<SkillsProRegistryEntryAttributes> {
  meta: SkillsProRegistryMeta;
}

/** Public marketing catalogue; intentionally separate from the app registry. */
export interface SkillsProStorefrontCatalogDto extends SkillsProRegistryMeta {
  skills: SkillsProRegistryEntryDto[];
}
