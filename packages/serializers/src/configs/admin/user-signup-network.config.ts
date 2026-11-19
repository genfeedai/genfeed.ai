import { userSignupNetworkAttributes } from '@serializers/attributes/admin/user-signup-network.attributes';
import { simpleConfig } from '@serializers/builders';

export const userSignupNetworkSerializerConfig = simpleConfig(
  'user-signup-network',
  userSignupNetworkAttributes,
);
