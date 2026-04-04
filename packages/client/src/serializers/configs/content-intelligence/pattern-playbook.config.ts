import { patternPlaybookAttributes } from '../../attributes/content-intelligence/pattern-playbook.attributes';
import { simpleConfig } from '../../builders';

export const patternPlaybookSerializerConfig = simpleConfig(
  'pattern-playbook',
  patternPlaybookAttributes,
);
