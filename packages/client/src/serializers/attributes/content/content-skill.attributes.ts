import { createEntityAttributes } from '@genfeedai/helpers';

export const contentSkillAttributes = createEntityAttributes([
  'organization',
  'slug',
  'name',
  'description',
  'category',
  'requiredProviders',
  'configSchema',
  'isBuiltIn',
  'isEnabled',
]);
