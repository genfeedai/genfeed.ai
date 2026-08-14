import { buildSerializer } from '@serializers/builders';
import {
  socialWarmupEnrollmentSerializerConfig,
  socialWarmupEventSerializerConfig,
  socialWarmupSignalSerializerConfig,
} from '@serializers/configs';

export const { SocialWarmupEnrollmentSerializer } = buildSerializer(
  'server',
  socialWarmupEnrollmentSerializerConfig,
);

export const { SocialWarmupEventSerializer } = buildSerializer(
  'server',
  socialWarmupEventSerializerConfig,
);

export const { SocialWarmupSignalSerializer } = buildSerializer(
  'server',
  socialWarmupSignalSerializerConfig,
);
