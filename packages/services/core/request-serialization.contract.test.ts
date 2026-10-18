import { IngredientCategory, TagCategory } from '@genfeedai/contracts';
import {
  axiosResponse,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { StripeService } from '@services/billing/stripe.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { TagsService } from '@services/content/tags.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import { ActivitiesService } from '@services/social/activities.service';
import { describe, expect, it, vi } from 'vitest';

// Wire fixtures use the package artifact consumed by the browser, never the unit-test mock.
vi.mock(
  '@genfeedai/serializers/request-runtime',
  () => import('@request-serializers-built'),
);

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Raw historical wire samples include id-only relationships and nulls outside DTO types.
const media: unknown = {
  id: 'media-1',
  brand: 'brand-1',
  organization: 'org-1',
  text: 'A fox in the snow',
  model: 'model-1',
  outputs: 2,
  tags: ['tag-1', 'tag-2'],
  references: [{ id: 'source-1' }],
  metadata: { id: 'metadata-1', label: '', description: null },
  unused: undefined,
  crunQuoteId: 'quote-1',
  crunControls: { fps: 24 },
  frameRate: 24,
};

const edit = {
  width: 1280,
  height: 720,
  model: 'model-1',
  text: '',
  prompt: 'Soft lighting',
  outputFormat: 'png' as const,
  outputs: 2,
  metadata: { label: '', description: null },
  references: ['source-1'],
  brand: 'brand-1',
  organization: 'org-1',
};

const serializerNames = [
  'ActivityBulkPatchSerializer',
  'AvatarSerializer',
  'ImageEditSerializer',
  'ImageEditingRequestSerializer',
  'ImageGenerationSerializer',
  'ImageSerializer',
  'IngredientBulkDeleteSerializer',
  'IngredientMergeSerializer',
  'IngredientSerializer',
  'MemberInvitationSerializer',
  'MetadataSerializer',
  'MusicSerializer',
  'NotificationPreferenceSerializer',
  'OrganizationSettingSerializer',
  'SettingSerializer',
  'StripeCheckoutSerializer',
  'TagSerializer',
  'VideoCaptionSerializer',
  'VideoEditSerializer',
  'VideoGenerationSerializer',
  'VideoSerializer',
] as const;

describe('canonical request wire bodies', () => {
  it('reuses the actual artifact objects and honors mutable serializer options through the loader', async () => {
    const runtime = await import('@request-serializers-built');
    const again = await import('@request-serializers-built');
    const { serializeRequest } = await import(
      '@services/core/request-serializers'
    );
    expect(runtime.TagSerializer).toBe(again.TagSerializer);
    const serializer = runtime.TagSerializer as typeof runtime.TagSerializer & {
      opts: Record<string, unknown>;
    };
    const previous = serializer.opts;
    try {
      serializer.opts = {
        ...previous,
        topLevelLinks: { self: '/tags?page=2' },
      };
      expect(
        await serializeRequest('TagSerializer', [{ id: 'tag-1', label: 'A' }]),
      ).toMatchObject({
        data: [{ id: 'tag-1', attributes: { label: 'A' } }],
        links: { self: '/tags?page=2' },
      });
      expect(runtime.TagSerializer).toBe(again.TagSerializer);
    } finally {
      serializer.opts = previous;
    }
  });

  it('preserves null, missing relationships and array wire behavior for all 21 serializers', async () => {
    const { serializeRequest } = await import(
      '@services/core/request-serializers'
    );
    const cases = {
      missing: {},
      null: null,
      undefined: undefined,
      emptyArray: [],
      array: [media, { id: 'media-2', metadata: null, tags: [] }],
      nullRelationships: {
        id: 'media-1',
        metadata: null,
        brand: null,
        organization: null,
        references: undefined,
        tags: [],
      },
    };
    const wire: Record<string, unknown> = {};
    for (const name of serializerNames) {
      for (const [variant, input] of Object.entries(cases)) {
        try {
          wire[`${name}: ${variant}`] = JSON.stringify(
            await serializeRequest(name, input),
          );
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          wire[`${name}: ${variant}`] = {
            error: error.name,
            message: error.message,
          };
        }
      }
    }
    expect(wire).toMatchSnapshot();
  });

  it('preserves all 30 service serialization paths byte for byte', async () => {
    const requests: Record<string, string> = {};
    async function capture(
      name: string,
      service: unknown,
      run: () => Promise<unknown>,
    ): Promise<void> {
      const http = installMockHttp(service);
      const response = axiosResponse(resourceDocument({ label: 'Response' }));
      http.post.mockResolvedValue(response);
      http.patch.mockResolvedValue(response);
      http.delete.mockResolvedValue(response);
      await run();
      const calls = (['post', 'patch', 'delete'] as const).flatMap((method) =>
        http[method].mock.calls.map(([url, payload]) => ({
          method,
          url,
          body: method === 'delete' ? payload.data : payload,
        })),
      );
      expect(calls, name).toHaveLength(1);
      requests[name] = JSON.stringify(calls[0]);
    }

    const stripe = new StripeService('wire-token');
    await capture('StripeCheckoutSerializer: checkout', stripe, () =>
      stripe.createCheckoutSession({
        stripePriceId: 'price-1',
        quantity: 2,
        successUrl: '/success',
        cancelUrl: '/cancel',
      } as Parameters<StripeService['createCheckoutSession']>[0]),
    );

    const ingredients = new IngredientsService('ingredients', 'wire-token');
    for (const category of [
      IngredientCategory.VIDEO,
      IngredientCategory.IMAGE,
      IngredientCategory.MUSIC,
      IngredientCategory.AVATAR,
      'ingredients',
    ]) {
      await capture(`ingredient create: ${category}`, ingredients, () =>
        ingredients.post(category, media),
      );
    }
    await capture('MetadataSerializer: metadata patch', ingredients, () =>
      ingredients.patchMetadata('media-1', {
        id: 'metadata-1',
        label: '',
        description: null,
        width: 1280,
        model: 'model-1',
      } as Parameters<IngredientsService['patchMetadata']>[1]),
    );
    await capture('IngredientBulkDeleteSerializer: delete', ingredients, () =>
      ingredients.bulkDelete({
        type: 'ingredient',
        ids: ['media-1', 'media-2'],
      }),
    );

    const tags = new TagsService('wire-token');
    await capture('TagSerializer: create', tags, () =>
      tags.addTagToEntity(TagCategory.INGREDIENT, 'media-1', ''),
    );
    await capture('TagSerializer: update', tags, () =>
      tags.updateTag('tag-1', 'Updated'),
    );

    const images = new ImagesService('wire-token');
    await capture('ImageGenerationSerializer: image create', images, () =>
      images.post(media as Parameters<ImagesService['post']>[0]),
    );
    await capture('ImageEditingRequestSerializer: edit', images, () =>
      images.postEdit(
        'media-1',
        edit as Parameters<ImagesService['postEdit']>[1],
      ),
    );
    await capture('ImageEditSerializer: upscale', images, () =>
      images.postUpscale('media-1', edit),
    );
    await capture('ImageEditSerializer: reframe', images, () =>
      images.postReframe('media-1', edit),
    );

    const music = new MusicsService('wire-token');
    await capture('MusicSerializer: music create', music, () =>
      music.post(media as Parameters<MusicsService['post']>[0]),
    );

    const videos = new VideosService('wire-token');
    await capture('VideoGenerationSerializer: video create', videos, () =>
      videos.post(media as Parameters<VideosService['post']>[0]),
    );
    await capture('VideoSerializer: lip sync', videos, () =>
      videos.postLipSync(media as Parameters<VideosService['postLipSync']>[0]),
    );
    await capture('IngredientMergeSerializer: merge', videos, () =>
      videos.postMerge({
        ids: ['media-1', 'media-2'],
        format: 'mp4',
      } as unknown as Parameters<VideosService['postMerge']>[0]),
    );
    await capture('VideoEditSerializer: upscale', videos, () =>
      videos.postUpscale('media-1', edit),
    );
    await capture('VideoEditSerializer: reframe', videos, () =>
      videos.postReframe('media-1', edit),
    );
    await capture('VideoCaptionSerializer: captions', videos, () =>
      videos.postCaptions('media-1', 'caption-1'),
    );
    await capture('VideoSerializer: avatar', videos, () =>
      videos.createAvatarVideo({
        avatarId: 'avatar-1',
        photoUrl: 'https://example.com/avatar.png',
        elevenlabsVoiceId: 'voice-1',
        text: '',
      }),
    );

    const organizations = new OrganizationsService('wire-token');
    await capture(
      'OrganizationSettingSerializer: settings',
      organizations,
      () =>
        organizations.patchSettings('org-1', {
          timezone: 'Europe/Brussels',
          isWatermarkEnabled: false,
          defaultVoiceRef: null,
          enabledModelIds: ['model-1', 'model-2'],
        }),
    );
    await capture('MemberInvitationSerializer: invitation', organizations, () =>
      organizations.inviteMember('org-1', {
        email: 'member@example.com',
        organizationId: 'org-1',
        roleId: 'role-1',
        firstName: '',
        lastName: null,
      } as unknown as Parameters<OrganizationsService['inviteMember']>[1]),
    );

    const users = new UsersService('wire-token');
    const settings = {
      id: 'setting-1',
      theme: 'dark',
      favoriteWorkflowIds: ['workflow-1', 'workflow-2'],
      contentPreferences: { topics: [] },
    } as unknown as Parameters<UsersService['patchSettings']>[1];
    await capture('SettingSerializer: user settings', users, () =>
      users.patchSettings('user-1', settings),
    );
    await capture('SettingSerializer: current user settings', users, () =>
      users.patchMeSettings(settings),
    );
    await capture('NotificationPreferenceSerializer: workflow', users, () =>
      users.patchWorkflowEmailNotificationPreference(false),
    );
    await capture('NotificationPreferenceSerializer: agent', users, () =>
      users.patchAgentEmailNotificationPreference(true),
    );
    await capture('NotificationPreferenceSerializer: product', users, () =>
      users.patchProductEmailPreference('content.weekly', false),
    );

    const activities = new ActivitiesService('wire-token');
    await capture('ActivityBulkPatchSerializer: activities', activities, () =>
      activities.bulkPatch({
        type: 'activity',
        ids: ['activity-1', 'activity-2'],
        isRead: true,
      }),
    );
    expect(Object.keys(requests)).toHaveLength(30);
    expect(requests).toMatchSnapshot();
  });
});
