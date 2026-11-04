import { buildCardView, withCardResult } from '@mcp/ui/card-data';
import { describe, expect, it } from 'vitest';

describe('cards for settings, plans and receipts', () => {
  it('groups the callable models by type with the estimate and balance', () => {
    expect(
      buildCardView('get_generation_options', {
        cost: { balance: 1200, estimate: { credits: 24, status: 'estimated' } },
        models: [
          { key: 'flux-2-pro', label: 'FLUX.2 Pro', type: 'image' },
          { key: 'seedream-4', label: 'Seedream 4', type: 'image' },
          { key: 'veo-3', label: 'Veo 3', type: 'video' },
        ],
        settings: {
          brandEnabled: null,
          isEnabled: true,
          organizationEnabled: true,
          source: 'organization',
        },
      }),
    ).toMatchObject({
      cards: [
        {
          facts: [
            { label: 'Prompt enhancement', status: 'active', value: 'On' },
            { label: 'Set by', value: 'Organization' },
            {
              items: [{ label: 'FLUX.2 Pro' }, { label: 'Seedream 4' }],
              label: 'Image models',
              value: 'FLUX.2 Pro, Seedream 4',
            },
            { items: [{ label: 'Veo 3' }], label: 'Video models' },
          ],
          metrics: [
            { isPrimary: true, label: 'Estimated credits', value: '24' },
            { label: 'Credit balance', value: '1,200' },
          ],
          title: 'Generation options',
        },
      ],
      layout: 'cards',
    });
  });

  it('says why an estimate is unavailable', () => {
    expect(
      buildCardView('get_generation_options', {
        cost: {
          balance: 40,
          estimate: {
            credits: null,
            status: 'unavailable',
            unavailableDetail: 'outputs must be a whole number from 1 to 8.',
          },
        },
        models: [],
        settings: { isEnabled: false, source: 'default' },
      })?.cards[0],
    ).toMatchObject({
      description: 'outputs must be a whole number from 1 to 8.',
      facts: [
        { label: 'Estimate', status: 'needs_attention', value: 'Unavailable' },
        { label: 'Prompt enhancement', status: 'planned', value: 'Off' },
        { label: 'Set by', value: 'Default' },
      ],
      metrics: [{ label: 'Credit balance', value: '40' }],
    });
  });

  it('shows the effective enhancement setting after a change', () => {
    expect(
      buildCardView('set_generation_settings', {
        brandEnabled: false,
        brandId: 'brand-1',
        isEnabled: false,
        organizationEnabled: true,
        source: 'brand',
      })?.cards[0].facts,
    ).toEqual([
      { label: 'Prompt enhancement', status: 'planned', value: 'Off' },
      { label: 'Set by', value: 'This brand' },
      { label: 'Organization', value: 'On' },
      { label: 'Brand', value: 'Off' },
    ]);
  });

  it('leads with the enhanced prompt and keeps the original beneath it', () => {
    expect(
      buildCardView('enhance_prompt', {
        generationHarness: {
          appliedPacks: [{ id: 'pack-1', version: '3' }],
          brandId: 'brand-1',
          brandMode: 'approved_brand',
          enhancedPrompt: 'A sunlit loft studio, brand teal accents, 35mm.',
          originalPrompt: 'a studio photo',
          source: 'brand',
          status: 'applied',
        },
        prompt: 'A sunlit loft studio, brand teal accents, 35mm.',
      })?.cards[0],
    ).toMatchObject({
      description: 'A sunlit loft studio, brand teal accents, 35mm.',
      facts: [
        { label: 'Original', value: 'a studio photo' },
        { label: 'Brand', value: 'Approved brand' },
        { label: 'Skill packs', value: '1 applied' },
      ],
      status: 'completed',
      title: 'Enhanced prompt',
    });
  });

  it('marks a failed enhancement that fell back to the typed prompt', () => {
    expect(
      buildCardView('enhance_prompt', {
        generationHarness: {
          enhancedPrompt: 'a studio photo',
          isEnhancementFailed: true,
          originalPrompt: 'a studio photo',
          status: 'skipped',
        },
        prompt: 'a studio photo',
      })?.cards[0],
    ).toMatchObject({
      description: 'a studio photo',
      facts: [],
      status: 'failed',
    });
  });

  it('shows a queued Turbo run with its size and cost', () => {
    expect(
      buildCardView('generate_turbo_content', {
        estimatedCredits: 180,
        message: 'Turbo run created with 12 items. Processing started.',
        status: 'running',
        totalCount: 12,
        turboRunId: 'turbo-1',
      })?.cards[0],
    ).toMatchObject({
      description: 'Turbo run created with 12 items. Processing started.',
      metrics: [
        { isPrimary: true, label: 'Items', value: '12' },
        { label: 'Estimated credits', value: '180' },
      ],
      status: 'running',
      title: 'Turbo run',
    });
  });

  it('lists every change made to fit the repurposed draft to its channel', () => {
    expect(
      buildCardView('repurpose_post', {
        adjustments: [
          {
            code: 'links_removed',
            message: 'Removed 1 link that is not clickable on Instagram.',
          },
          { code: 'hashtags_trimmed', message: 'Kept the first 5 hashtags.' },
        ],
        id: 'post-2',
        mode: 'deterministic',
        platform: 'instagram',
        status: 'draft',
      })?.cards[0],
    ).toMatchObject({
      description:
        '- Removed 1 link that is not clickable on Instagram.\n- Kept the first 5 hashtags.',
      facts: [{ label: 'Method', value: 'Adapted to the channel rules' }],
      platform: 'instagram',
      status: 'draft',
      title: 'Draft for Instagram',
    });
  });

  it('says when a repurposed post needed no change', () => {
    expect(
      buildCardView('repurpose_post', {
        adjustments: [],
        id: 'post-3',
        mode: 'agent',
        platform: 'linkedin',
        status: 'draft',
      })?.cards[0].facts,
    ).toEqual([
      { label: 'Method', value: 'Rewritten by the agent' },
      { label: 'Changes', value: 'None, the post already fits' },
    ]);
  });

  it('shows a campaign with its goal, window, audience and tone', () => {
    expect(
      buildCardView('manage_campaign', {
        assetIds: ['a-1', 'a-2'],
        audience: 'Indie founders',
        brandId: 'brand-1',
        endDate: '2026-12-15T00:00:00.000Z',
        id: 'campaign-1',
        name: 'Winter launch',
        objective: 'Sign up 200 teams before the holidays.',
        startDate: '2026-11-15T00:00:00.000Z',
        status: 'active',
        tone: 'Warm and direct',
      }),
    ).toMatchObject({
      cards: [
        {
          description: 'Sign up 200 teams before the holidays.',
          facts: [
            { label: 'Runs', value: '2026-11-15 to 2026-12-15' },
            { label: 'Audience', value: 'Indie founders' },
            { label: 'Tone', value: 'Warm and direct' },
            { label: 'Assets', value: '2 attached' },
          ],
          status: 'active',
          title: 'Winter launch',
        },
      ],
      isCountHidden: true,
      title: 'Campaign',
    });
  });

  it('lists a brand campaigns with a count', () => {
    expect(
      buildCardView('manage_campaign', [
        { id: 'campaign-1', name: 'Winter launch', status: 'active' },
        { id: 'campaign-2', name: 'Spring teaser', status: 'draft' },
      ]),
    ).toMatchObject({
      cards: [{ title: 'Winter launch' }, { title: 'Spring teaser' }],
      isCountHidden: false,
      title: 'Campaigns',
      total: 2,
    });
  });

  it.each([
    [
      'a website scan',
      {
        brandId: 'brand-1',
        sourceUrl: 'https://acme.example',
        status: 'scanned',
        summary: {
          description: 'Acme makes quiet espresso machines.',
          name: 'Acme',
          primaryColor: '#0F766E',
          secondaryColor: '#F59E0B',
          tone: 'Calm, expert',
        },
      },
      {
        description: 'Acme makes quiet espresso machines.',
        facts: [
          { label: 'Website', value: 'https://acme.example' },
          { label: 'Colors', value: '#0F766E, #F59E0B' },
          { label: 'Tone', value: 'Calm, expert' },
        ],
        hasAvatar: true,
        status: 'completed',
        title: 'Acme',
      },
    ],
    [
      'a failed website scan',
      {
        brandId: 'brand-1',
        reason: 'invalid_url',
        sourceUrl: 'https://acme',
        status: 'failed',
      },
      {
        description: 'Invalid url',
        status: 'failed',
        title: 'Website scan failed',
      },
    ],
    [
      'a brand created from a URL',
      {
        brandId: 'brand-2',
        completenessScore: 64.4,
        incompleteFields: ['goals', 'competitors'],
        reviewUrl: 'https://app.genfeed.ai/settings/brands/acme',
        revisionStatus: 'draft',
        scanStatus: 'succeeded',
      },
      {
        facts: [
          { label: 'Revision', value: 'Draft, review it to approve' },
          {
            items: [{ label: 'Goals' }, { label: 'Competitors' }],
            label: 'Still missing',
          },
        ],
        linkLabel: 'Review brand',
        metrics: [{ label: 'Brand profile', value: '64%' }],
        status: 'completed',
        title: 'Brand created',
        url: 'https://app.genfeed.ai/settings/brands/acme',
      },
    ],
    [
      'saved onboarding answers',
      {
        answeredFields: ['goals', 'platforms'],
        brandId: 'brand-2',
        completenessScore: 80,
        creditsEarned: 20,
        message: 'Onboarding answers saved.',
        rewardedFields: ['goals', 'platforms'],
        skippedFields: ['offer'],
      },
      {
        facts: [
          {
            items: [{ label: 'Goals' }, { label: 'Channels' }],
            label: 'Answered',
          },
          { items: [{ label: 'Offer' }], label: 'Skipped' },
        ],
        metrics: [
          { label: 'Brand profile', value: '80%' },
          { label: 'Credits earned', value: '20' },
        ],
        title: 'Brand answers saved',
      },
    ],
    [
      'finished onboarding',
      { onboardingCompleted: true, organizationId: 'org-1', userId: 'user-1' },
      { status: 'completed', title: 'Onboarding complete' },
    ],
  ])('shows %s from onboard_brand', (_label, payload, expected) => {
    expect(buildCardView('onboard_brand', payload)?.cards[0]).toMatchObject(
      expected,
    );
  });

  it('describes the upload slot the agent is about to fill', () => {
    expect(
      buildCardView('request_media_upload', {
        assetId: 'asset-1',
        constraints: {
          acceptedExtensions: ['jpg', 'png', 'webp'],
          category: 'image',
          maxBytes: 20 * 1024 * 1024,
        },
        expiresIn: 900,
        uploadUrl: 'https://uploads.example/put',
      })?.cards[0],
    ).toMatchObject({
      facts: [
        { label: 'Type', value: 'Image' },
        { label: 'Max size', value: '20 MB' },
        { label: 'Formats', value: 'jpg, png, webp' },
        { label: 'Expires in', value: '15 min' },
      ],
      status: 'pending',
      title: 'Upload ready',
    });
  });

  it('shows a completed upload as library media', () => {
    expect(
      buildCardView('complete_media_upload', {
        assetId: 'asset-1',
        media: [{ assetId: 'asset-1', kind: 'image', order: 0 }],
        status: 'uploaded',
        url: 'https://cdn.genfeed.ai/ingredients/images/asset-1.png',
      }),
    ).toMatchObject({
      cards: [
        {
          id: 'asset-1',
          kind: 'image',
          status: 'completed',
          title: 'Uploaded file',
          url: 'https://cdn.genfeed.ai/ingredients/images/asset-1.png',
        },
      ],
      layout: 'media',
    });
  });

  it('shows an upload still processing as a receipt that does not poll', () => {
    expect(
      buildCardView('complete_media_upload', {
        assetId: 'asset-1',
        status: 'processing',
      })?.cards[0],
    ).toMatchObject({
      kind: 'summary',
      status: 'processing',
      title: 'Upload received',
    });
  });

  it('cards the toolsets find_tools lists, from its unwrapped result', () => {
    expect(
      withCardResult('find_tools', {
        content: [{ text: 'Available toolsets', type: 'text' as const }],
        structuredContent: {
          toolsets: [
            {
              description: 'Accounts, brands and posts.',
              isAlwaysOn: true,
              name: 'core',
              toolCount: 14,
              toolNames: [],
            },
          ],
        },
      }).structuredContent?.genfeedCards,
    ).toMatchObject({
      cards: [
        {
          description: 'Accounts, brands and posts.',
          facts: [
            { label: 'Tools', value: '14' },
            { label: 'Loaded', status: 'active', value: 'Always on' },
          ],
          title: 'Core',
        },
      ],
      title: 'Toolsets',
    });
  });

  it('cards the tools a find_tools search matched', () => {
    expect(
      withCardResult('find_tools', {
        content: [{ text: 'Found 1 tool(s)', type: 'text' as const }],
        structuredContent: {
          tools: [
            {
              creditCost: 4,
              description: 'Create a campaign.\nLonger notes.',
              mutationPolicy: 'approval',
              name: 'manage_campaign',
              toolset: 'campaigns',
            },
          ],
        },
      }).structuredContent?.genfeedCards?.cards[0],
    ).toMatchObject({
      description: 'Create a campaign.',
      facts: [
        { label: 'Toolset', value: 'Campaigns' },
        { label: 'Cost', value: '4 credits' },
        { label: 'Runs', status: 'pending_approval', value: 'After approval' },
      ],
      title: 'manage_campaign',
    });
  });

  it('says whether this connection lists a described tool', () => {
    expect(
      withCardResult('find_tools', {
        content: [{ text: 'Manage Campaign', type: 'text' as const }],
        structuredContent: {
          connection: {
            isListed: false,
            listedToolCount: 20,
            toolset: 'campaigns',
          },
          tool: {
            _meta: { 'genfeed.ai/creditCost': 0 },
            description: 'Create, read or update a brand campaign.',
            name: 'manage_campaign',
            title: 'Manage Campaign',
          },
        },
      }).structuredContent?.genfeedCards?.cards[0],
    ).toMatchObject({
      facts: [
        { label: 'Name', value: 'manage_campaign' },
        { label: 'Toolset', value: 'Campaigns' },
        {
          label: 'This connection',
          status: 'needs_attention',
          value: 'Not listed',
        },
      ],
      title: 'Manage Campaign',
    });
  });
});
