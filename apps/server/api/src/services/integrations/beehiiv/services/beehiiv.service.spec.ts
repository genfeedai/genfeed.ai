import { BeehiivProviderError as LegacyBeehiivProviderError } from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import type { BeehiivCreatePostInput as LegacyBeehiivCreatePostInput } from '@api/services/integrations/beehiiv/interfaces/beehiiv.interface';
import { BeehiivService as LegacyBeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { BeehiivProviderError as CanonicalBeehiivProviderError } from '@server/services/integrations/beehiiv/errors/beehiiv-provider.error';
import type { BeehiivCreatePostInput as CanonicalBeehiivCreatePostInput } from '@server/services/integrations/beehiiv/interfaces/beehiiv.interface';
import { BeehiivService as CanonicalBeehiivService } from '@server/services/integrations/beehiiv/services/beehiiv.service';

describe('Beehiiv API compatibility exports', () => {
  it('preserves the canonical service and provider-error runtime identities', () => {
    expect(LegacyBeehiivService).toBe(CanonicalBeehiivService);
    expect(LegacyBeehiivProviderError).toBe(CanonicalBeehiivProviderError);
  });

  it('preserves the canonical Beehiiv interface contract', () => {
    expectTypeOf<LegacyBeehiivCreatePostInput>().toEqualTypeOf<CanonicalBeehiivCreatePostInput>();
  });
});
