import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';

type Post = Parameters<
  ScheduledPostExecutionGuardService['assertAgentPublishingScope']
>[0];
type Scope = Record<string, unknown> & { brandId?: string; threadId?: string };

const post = (fields: Record<string, unknown>) => fields as unknown as Post;

describe('ScheduledPostExecutionGuardService', () => {
  let blockedThreads: Set<string>;
  let checkedScopes: Array<[Scope, string]>;
  // Durable review pins, readable only inside their own tenant and brand.
  let pins: Map<
    string,
    {
      brandId?: string;
      organizationId: string;
      reference: { kind: string; recordId: string };
    }
  >;
  let service: ScheduledPostExecutionGuardService;

  beforeEach(() => {
    blockedThreads = new Set();
    checkedScopes = [];
    pins = new Map([
      [
        'pin-1',
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          reference: { kind: 'post', recordId: 'post-1' },
        },
      ],
    ]);
    service = new ScheduledPostExecutionGuardService(
      ...([
        {
          assertVersionPinCurrent: async ({
            pinId,
            readContext,
          }: {
            pinId: string;
            readContext: { brandId?: string; organizationId: string };
          }) => {
            const pin = pins.get(pinId);
            if (
              !pin ||
              pin.organizationId !== readContext.organizationId ||
              pin.brandId !== readContext.brandId
            ) {
              throw new Error(`Version pin ${pinId} was not found`);
            }
            return { reference: pin.reference };
          },
        },
        {
          assertConsequentialBoundary: async (scope: Scope, action: string) => {
            checkedScopes.push([scope, action]);
            if (blockedThreads.has(scope.threadId ?? '')) {
              throw new Error('Thread context is blocked');
            }
          },
          assertResourceBrand: (
            scope: Scope,
            resourceBrandId: string,
            label: string,
          ) => {
            if (scope.brandId !== resourceBrandId) {
              throw new Error(`${label} is outside the thread brand scope`);
            }
          },
        },
      ] as unknown as ConstructorParameters<
        typeof ScheduledPostExecutionGuardService
      >),
    );
  });

  describe('assertPublishVersionPin', () => {
    it('accepts a durable version pin read in the post tenant and brand scope', async () => {
      await expect(
        service.assertPublishVersionPin(
          post({
            brandId: 'brand-1',
            id: 'post-1',
            organizationId: 'org-1',
            reviewVersionPinId: 'pin-1',
          }),
          'pin-1',
        ),
      ).resolves.toBeUndefined();
    });

    it('cannot read a pin from another brand', async () => {
      await expect(
        service.assertPublishVersionPin(
          post({
            brandId: 'brand-2',
            id: 'post-1',
            organizationId: 'org-1',
            reviewVersionPinId: 'pin-1',
          }),
        ),
      ).rejects.toThrow('was not found');
    });

    it('rejects a queued pin after the durable review pin changes', async () => {
      await expect(
        service.assertPublishVersionPin(
          post({
            id: 'post-1',
            organizationId: 'org-1',
            reviewVersionPinId: 'pin-2',
          }),
          'pin-1',
        ),
      ).rejects.toThrow('does not match');
    });

    it('rejects a queued pin when the post has no durable review pin', async () => {
      await expect(
        service.assertPublishVersionPin(
          post({ id: 'post-1', organizationId: 'org-1' }),
          'pin-1',
        ),
      ).rejects.toThrow('has no durable review pin');
    });

    it('rejects version-pin validation without a durable organization', async () => {
      await expect(
        service.assertPublishVersionPin(
          post({ id: 'post-1', reviewVersionPinId: 'pin-1' }),
        ),
      ).rejects.toThrow('missing an organization');
    });

    it.each([
      ['kind', { kind: 'asset', recordId: 'post-1' }],
      ['record identity', { kind: 'post', recordId: 'post-2' }],
    ])('rejects a version pin with mismatched %s', async (_case, reference) => {
      pins.set('pin-1', {
        brandId: 'brand-1',
        organizationId: 'org-1',
        reference,
      });

      await expect(
        service.assertPublishVersionPin(
          post({
            brandId: 'brand-1',
            id: 'post-1',
            organizationId: 'org-1',
            reviewVersionPinId: 'pin-1',
          }),
        ),
      ).rejects.toThrow('does not reference post post-1');
    });
  });

  describe('assertAgentPublishingScope', () => {
    const agentPost = {
      agentContextSource: 'explicit',
      agentContextVersion: 2,
      agentThreadId: 'thread-1',
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };

    it('lets a non-agent post through even when every thread is blocked', async () => {
      blockedThreads.add('');

      await expect(
        service.assertAgentPublishingScope(
          post({ id: 'post-1', organizationId: 'org-1' }),
        ),
      ).resolves.toBeUndefined();
      expect(checkedScopes).toEqual([]);
    });

    it.each([
      ['without a context version', { agentContextVersion: undefined }],
      [
        'with an unknown scope source',
        { agentContextSource: 'future_unregistered_source' },
      ],
    ])(
      'rejects durable agent scope %s before provider execution',
      async (_case, fields) => {
        await expect(
          service.assertAgentPublishingScope(post({ ...agentPost, ...fields })),
        ).rejects.toThrow('incomplete durable agent scope');
        expect(checkedScopes).toEqual([]);
      },
    );

    it('checks the publish boundary on the scope rebuilt from the post', async () => {
      await expect(
        service.assertAgentPublishingScope(post(agentPost)),
      ).resolves.toBeUndefined();

      expect(checkedScopes).toEqual([
        [
          {
            brandId: 'brand-1',
            contextVersion: 2,
            isLegacyFallback: false,
            isVersionExplicit: true,
            organizationId: 'org-1',
            source: 'explicit',
            threadId: 'thread-1',
            userId: 'user-1',
          },
          'publish',
        ],
      ]);
    });

    it('stops an agent post whose thread context is blocked', async () => {
      blockedThreads.add('thread-1');

      await expect(
        service.assertAgentPublishingScope(post(agentPost)),
      ).rejects.toThrow('Thread context is blocked');
    });
  });
});
