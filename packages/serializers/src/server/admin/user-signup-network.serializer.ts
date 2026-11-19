import { buildSerializer } from '@serializers/builders';
import { userSignupNetworkSerializerConfig } from '@serializers/configs';

export const { UserSignupNetworkSerializer } = buildSerializer(
  'server',
  userSignupNetworkSerializerConfig,
);
