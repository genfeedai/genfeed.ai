import {
  getModelMaxAudioReferences,
  hasAudioReferences,
} from '@genfeedai/contracts/constants';
import { modelAttributes } from '@serializers/attributes/collections/model.attributes';
import { simpleConfig } from '@serializers/builders';

export const modelSerializerConfig = {
  ...simpleConfig('model', modelAttributes),
  attributeDerivations: {
    hasAudioReferences: (record: Record<string, unknown>) =>
      typeof record.key === 'string' && hasAudioReferences(record.key),
    maxAudioReferences: (record: Record<string, unknown>) =>
      typeof record.key === 'string'
        ? getModelMaxAudioReferences(record.key)
        : 0,
  },
};
