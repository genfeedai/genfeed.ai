import { createEntityAttributes } from '@genfeedai/helpers';

export const userSignupAttributionAttributes = createEntityAttributes([
  'referrerDomain',
  'landingPath',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
]);
