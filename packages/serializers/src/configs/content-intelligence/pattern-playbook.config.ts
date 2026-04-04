import { patternPlaybookAttributes } from '@serializers/attributes/content-intelligence/pattern-playbook.attributes';
import { simpleConfig } from '@serializers/builders';

export const patternPlaybookSerializerConfig = simpleConfig(
  'pattern-playbook',
  patternPlaybookAttributes,
);
