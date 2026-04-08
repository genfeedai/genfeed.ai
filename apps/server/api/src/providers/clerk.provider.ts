import { ConfigService } from '@api/config/config.service';
import { createClerkClient } from '@clerk/backend';
import { IS_LOCAL_MODE } from '@genfeedai/config';

export const ClerkClientProvider = {
  inject: [ConfigService],
  provide: 'ClerkClient',
  useFactory: (configService: ConfigService) => {
    if (IS_LOCAL_MODE) return null;

    return createClerkClient({
      publishableKey: configService.get('CLERK_PUBLISHABLE_KEY'),
      secretKey: configService.get('CLERK_SECRET_KEY'),
    });
  },
};
