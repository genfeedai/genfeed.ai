import {
  socialWarmupEnrollmentAttributes,
  socialWarmupEventAttributes,
  socialWarmupSignalAttributes,
} from '@serializers/attributes/social/social-warmup-enrollment.attributes';
import { simpleConfig } from '@serializers/builders';

export const socialWarmupEnrollmentSerializerConfig = simpleConfig(
  'social-warmup-enrollment',
  socialWarmupEnrollmentAttributes,
);

export const socialWarmupEventSerializerConfig = simpleConfig(
  'social-warmup-event',
  socialWarmupEventAttributes,
);

export const socialWarmupSignalSerializerConfig = simpleConfig(
  'social-warmup-signal',
  socialWarmupSignalAttributes,
);
