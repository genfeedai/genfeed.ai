import type { BetterAuthOptions } from 'better-auth';

export const betterAuthUserAdditionalFields = {
  // The adapter must keep hook-supplied fields even though clients cannot set them.
  handle: { input: false, required: false, type: 'string' },
  signupIpAddress: {
    input: false,
    required: false,
    returned: false,
    type: 'string',
  },
} satisfies NonNullable<BetterAuthOptions['user']>['additionalFields'];
