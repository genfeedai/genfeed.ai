import { buildSerializer } from '@serializers/builders';
import { brandRelocationSerializerConfig } from '@serializers/configs/organizations/brand-relocation.config';
export const { BrandRelocationSerializer } = buildSerializer(
  'server',
  brandRelocationSerializerConfig,
);
