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

export interface SkillsProRegistryCatalogDto extends SkillsProRegistryMeta {
  skills: SkillsProRegistryEntryDto[];
}

export interface SkillsProRegistryResponse
  extends JsonApiCollectionResponse<SkillsProRegistryEntryAttributes> {
  meta: SkillsProRegistryMeta;
}

export interface SkillsProStorefrontEntryDto {
  category: string;
  description: string;
  name: string;
  slug: string;
}

/** Public marketing projection; intentionally smaller than the app registry. */
export interface SkillsProStorefrontCatalogDto {
  bundlePrice: number;
  skills: SkillsProStorefrontEntryDto[];
}
