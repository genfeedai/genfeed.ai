import { voteAttributes } from '@serializers/attributes/collections/vote.attributes';
import { simpleConfig } from '@serializers/builders';

export const voteSerializerConfig = simpleConfig('vote', voteAttributes);
