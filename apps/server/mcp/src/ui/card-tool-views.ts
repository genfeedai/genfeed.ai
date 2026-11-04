import {
  MCP_CREDIT_COST_META_KEY,
  MCP_MUTATION_POLICY_META_KEY,
  MCP_TOOLSET_META_KEY,
} from '@genfeedai/actions';
import type {
  McpCard,
  McpCardFact,
  McpCardView,
} from '@mcp/shared/interfaces/mcp-app.interface';
import {
  channelLabel,
  fact,
  formatAmount,
  metric,
  record,
  rows,
  safeCardUrl,
  summaryCard,
  text,
  words,
} from '@mcp/ui/card-fields';

/**
 * Card views for the tools that answer with settings, plans or receipts
 * rather than content: generation options and settings, prompt enhancement,
 * Turbo runs, repurposing, campaigns, brand onboarding, uploads and tool
 * discovery. Every builder reads the tool's own payload and shows it the way
 * a person reads it; identifiers stay in the structured data for the agent.
 */

function single(title: string, card: McpCard): McpCardView {
  return {
    cards: [card],
    isCountHidden: true,
    layout: 'cards',
    title,
    total: 1,
  };
}

function list(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter(
    (item): item is string => typeof item === 'string' && Boolean(item.trim()),
  );
}

/** A list of short strings as chips, e.g. model names or answered fields. */
function chips(label: string, values: string[], limit = 12): McpCardFact[] {
  if (!values.length) return [];
  const shown = values.slice(0, limit);
  const more = values.length - shown.length;
  return [
    {
      items: [
        ...shown.map((value) => ({ label: value })),
        ...(more > 0 ? [{ label: `+${more} more` }] : []),
      ],
      label,
      value: values.join(', '),
    },
  ];
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)}%`
    : '';
}

function onOff(value: unknown): string {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  return 'Inherited';
}

const MODEL_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['image', 'Image models'],
  ['image-edit', 'Image edit models'],
  ['video', 'Video models'],
  ['voice', 'Voice models'],
  ['music', 'Music models'],
];

const ENHANCEMENT_SOURCES: Readonly<Record<string, string>> = {
  brand: 'This brand',
  default: 'Default',
  organization: 'Organization',
  request: 'This request',
};

/** Prompt enhancement as one status line: on or off, and who decided it. */
function enhancementFact(settings: Record<string, unknown>): McpCardFact[] {
  if (typeof settings.isEnabled !== 'boolean') return [];
  return [
    {
      label: 'Prompt enhancement',
      status: settings.isEnabled ? 'active' : 'planned',
      value: settings.isEnabled ? 'On' : 'Off',
    },
    ...fact('Set by', ENHANCEMENT_SOURCES[text(settings, 'source')] ?? ''),
  ];
}

/**
 * `get_generation_options`: the models this account can call, grouped by
 * type, the prompt-enhancement setting, and the estimate and balance when a
 * type was asked for.
 */
function buildGenerationOptionsView(
  data: Record<string, unknown>,
): McpCardView {
  const models = rows(data.models);
  const cost = record(data.cost);
  const estimate = record(cost.estimate);
  const isUnavailable = text(estimate, 'status') === 'unavailable';
  const card = summaryCard(
    'Generation options',
    [
      ...(isUnavailable
        ? [
            {
              label: 'Estimate',
              status: 'needs_attention',
              value: 'Unavailable',
            },
          ]
        : []),
      ...enhancementFact(record(data.settings)),
      ...MODEL_GROUPS.flatMap(([type, label]) =>
        chips(
          label,
          models
            .filter((model) => text(model, 'type') === type)
            .map((model) => text(model, 'label', 'key')),
        ),
      ),
    ],
    {
      description: isUnavailable
        ? text(estimate, 'unavailableDetail') ||
          words(text(estimate, 'unavailableReason'))
        : '',
      id: 'generation-options',
      metrics: [
        ...metric('Estimated credits', estimate.credits, { isPrimary: true }),
        ...metric('Credit balance', cost.balance),
      ],
    },
  );
  return single('Generation options', card);
}

/** `set_generation_settings`: the effective setting after the change. */
function buildGenerationSettingsView(
  data: Record<string, unknown>,
): McpCardView {
  return single(
    'Generation settings',
    summaryCard(
      'Generation settings',
      [
        ...enhancementFact(data),
        ...('organizationEnabled' in data
          ? fact('Organization', onOff(data.organizationEnabled))
          : []),
        ...('brandEnabled' in data
          ? fact('Brand', onOff(data.brandEnabled))
          : []),
      ],
      { id: text(data, 'brandId') || 'generation-settings' },
    ),
  );
}

const BRAND_MODES: Readonly<Record<string, string>> = {
  approved_brand: 'Approved brand',
  provisional_brand: 'Provisional brand',
  raw: 'Prompt as typed',
};

/** `enhance_prompt`: the rewritten prompt first, the original beneath it. */
function buildEnhancePromptView(data: Record<string, unknown>): McpCardView {
  const receipt = record(data.generationHarness);
  const enhanced = text(data, 'prompt') || text(receipt, 'enhancedPrompt');
  const original = text(receipt, 'originalPrompt');
  const isFailed = receipt.isEnhancementFailed === true;
  const status = isFailed
    ? 'failed'
    : text(receipt, 'status') === 'applied'
      ? 'completed'
      : 'skipped';
  const packs = rows(receipt.appliedPacks).length;
  return single(
    'Enhanced prompt',
    summaryCard(
      'Enhanced prompt',
      [
        ...(original && original !== enhanced
          ? fact('Original', original.slice(0, 600))
          : []),
        ...fact('Brand', BRAND_MODES[text(receipt, 'brandMode')] ?? ''),
        ...(packs ? fact('Skill packs', `${packs} applied`) : []),
        ...fact('Avoid', text(receipt, 'negativePrompt').slice(0, 300)),
      ],
      {
        description: enhanced.slice(0, 4000),
        id: text(receipt, 'brandedGenerationReceiptId') || 'enhanced-prompt',
        status,
      },
    ),
  );
}

/** `generate_turbo_content`: the batch that was queued and what it costs. */
function buildTurboRunView(data: Record<string, unknown>): McpCardView {
  return single(
    'Turbo run',
    summaryCard('Turbo run', [], {
      description: text(data, 'message'),
      id: text(data, 'turboRunId'),
      metrics: [
        ...metric('Items', data.totalCount, { isPrimary: true }),
        ...metric('Estimated credits', data.estimatedCredits),
      ],
      status: text(data, 'status') || 'running',
    }),
  );
}

const REPURPOSE_MODES: Readonly<Record<string, string>> = {
  agent: 'Rewritten by the agent',
  deterministic: 'Adapted to the channel rules',
};

/** `repurpose_post`: the new draft's channel and every change made to fit it. */
function buildRepurposeView(data: Record<string, unknown>): McpCardView {
  const platform = text(data, 'platform');
  const changes = rows(data.adjustments)
    .map((item) => text(item, 'message'))
    .filter(Boolean);
  return single(
    'Repurposed post',
    summaryCard(
      `Draft for ${channelLabel(platform)}`,
      [
        ...fact(
          'Method',
          REPURPOSE_MODES[text(data, 'mode')] ?? words(text(data, 'mode')),
        ),
        ...fact('Changes', changes.length ? '' : 'None, the post already fits'),
      ],
      {
        description: changes.map((change) => `- ${change}`).join('\n'),
        id: text(data, 'id'),
        platform,
        status: text(data, 'status') || 'draft',
      },
    ),
  );
}

function day(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10);
}

/** One content campaign: its goal, window, audience and tone. */
function campaignCard(row: Record<string, unknown>): McpCard {
  const assets = list(row.assetIds).length;
  const start = day(text(row, 'startDate'));
  const end = day(text(row, 'endDate'));
  return summaryCard(
    text(row, 'name') || 'Campaign',
    [
      ...fact(
        'Runs',
        start && end
          ? `${start} to ${end}`
          : start
            ? `From ${start}`
            : end
              ? `Until ${end}`
              : '',
      ),
      ...fact('Audience', text(row, 'audience').slice(0, 300)),
      ...fact('Tone', text(row, 'tone').slice(0, 200)),
      ...(assets ? fact('Assets', `${assets} attached`) : []),
    ],
    {
      description: (
        text(row, 'objective') ||
        text(row, 'brief') ||
        text(row, 'creativeDirection')
      ).slice(0, 4000),
      id: text(row, 'id'),
      status: text(row, 'status'),
    },
  );
}

/** `manage_campaign`: one campaign, or the brand's campaigns. */
function buildCampaignView(payload: unknown): McpCardView {
  const campaigns = Array.isArray(payload)
    ? rows(payload)
    : text(record(payload), 'id')
      ? [record(payload)]
      : [];
  return {
    cards: campaigns.slice(0, 24).map(campaignCard),
    isCountHidden: campaigns.length === 1,
    layout: 'cards',
    title: campaigns.length === 1 ? 'Campaign' : 'Campaigns',
    total: campaigns.length,
  };
}

const BRAND_FIELD_LABELS: Readonly<Record<string, string>> = {
  cadence: 'Cadence',
  competitors: 'Competitors',
  goals: 'Goals',
  offer: 'Offer',
  platforms: 'Channels',
  toneAdjustment: 'Tone',
};

function fieldNames(value: unknown): string[] {
  return list(value).map((field) => BRAND_FIELD_LABELS[field] ?? words(field));
}

const SCAN_STATES: Readonly<Record<string, string>> = {
  failed: 'failed',
  running: 'processing',
  succeeded: 'completed',
};

/**
 * `onboard_brand`: each action answers with its own shape, so the card
 * follows the payload: a website scan, a brand created from a URL, saved
 * answers, or the finished onboarding.
 */
function buildOnboardingView(data: Record<string, unknown>): McpCardView {
  if (data.onboardingCompleted === true) {
    return single(
      'Onboarding',
      summaryCard('Onboarding complete', [], {
        description: 'The workspace is set up. Content can be generated now.',
        id: text(data, 'organizationId') || 'onboarding',
        status: 'completed',
      }),
    );
  }
  if (Array.isArray(data.answeredFields)) {
    return single(
      'Onboarding',
      summaryCard(
        'Brand answers saved',
        [
          ...chips('Answered', fieldNames(data.answeredFields)),
          ...chips('Skipped', fieldNames(data.skippedFields)),
        ],
        {
          id: text(data, 'brandId'),
          metrics: [
            ...(percent(data.completenessScore)
              ? [
                  {
                    label: 'Brand profile',
                    value: percent(data.completenessScore),
                  },
                ]
              : []),
            ...metric('Credits earned', data.creditsEarned),
          ],
          status: 'completed',
        },
      ),
    );
  }
  if (text(data, 'scanStatus')) {
    const isFailed = text(data, 'scanStatus') === 'failed';
    return single(
      'Onboarding',
      summaryCard(
        isFailed ? 'Brand scan failed' : 'Brand created',
        [
          ...fact(
            'Revision',
            text(data, 'revisionStatus') === 'approved'
              ? 'Approved'
              : text(data, 'revisionStatus')
                ? 'Draft, review it to approve'
                : '',
          ),
          ...chips('Still missing', fieldNames(data.incompleteFields)),
        ],
        {
          description: isFailed ? words(text(data, 'errorCode')) : '',
          id: text(data, 'brandId'),
          linkLabel: 'Review brand',
          metrics: percent(data.completenessScore)
            ? [
                {
                  label: 'Brand profile',
                  value: percent(data.completenessScore),
                },
              ]
            : [],
          status: SCAN_STATES[text(data, 'scanStatus')] ?? 'processing',
          url: safeCardUrl(text(data, 'reviewUrl')),
        },
      ),
    );
  }
  const summary = record(data.summary);
  const isFailed = text(data, 'status') === 'failed';
  const colors = [
    text(summary, 'primaryColor'),
    text(summary, 'secondaryColor'),
  ]
    .filter(Boolean)
    .join(', ');
  return single(
    'Onboarding',
    summaryCard(
      isFailed
        ? 'Website scan failed'
        : text(summary, 'name') || 'Website scan',
      [
        ...fact('Website', text(data, 'sourceUrl')),
        ...fact('Colors', colors),
        ...fact('Tone', text(summary, 'tone').slice(0, 200)),
      ],
      {
        avatarUrl: safeCardUrl(text(summary, 'logoUrl')),
        description: isFailed
          ? words(text(data, 'reason'))
          : text(summary, 'description').slice(0, 4000),
        hasAvatar: !isFailed,
        id: text(data, 'brandId') || text(data, 'sourceUrl'),
        status: isFailed ? 'failed' : 'completed',
      },
    ),
  );
}

function size(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  return bytes >= 1024 * 1024 * 1024
    ? `${formatAmount(bytes / (1024 * 1024 * 1024))} GB`
    : `${formatAmount(bytes / (1024 * 1024))} MB`;
}

/** `upload_media` (request): the upload slot the agent is about to fill. */
function buildUploadRequestView(data: Record<string, unknown>): McpCardView {
  const constraints = record(data.constraints);
  const seconds =
    typeof data.expiresIn === 'number' ? data.expiresIn : undefined;
  return single(
    'Upload',
    summaryCard(
      'Upload ready',
      [
        ...fact('Type', words(text(constraints, 'category'))),
        ...fact('Max size', size(constraints.maxBytes)),
        ...fact('Formats', list(constraints.acceptedExtensions).join(', ')),
        ...(seconds
          ? fact('Expires in', `${Math.max(1, Math.round(seconds / 60))} min`)
          : []),
      ],
      { id: text(data, 'assetId'), status: 'pending' },
    ),
  );
}

/**
 * `upload_media` (complete): a hosted file shows as media in the library
 * style; one still processing shows as a receipt rather than polling.
 */
function buildUploadCompleteView(
  data: Record<string, unknown>,
): McpCardView | 'media' {
  if (safeCardUrl(text(data, 'url'))) return 'media';
  return single(
    'Upload',
    summaryCard('Upload received', [], {
      description: 'The file is saved to the library and is being processed.',
      id: text(data, 'assetId'),
      status: text(data, 'status') || 'processing',
    }),
  );
}

/** A completed upload as a library media row. */
export function uploadedMediaRow(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const first = rows(data.media)[0] ?? {};
  return {
    ...data,
    id: text(data, 'assetId'),
    kind: text(first, 'kind'),
    status: 'completed',
    title: 'Uploaded file',
  };
}

function toolCard(row: Record<string, unknown>): McpCard {
  const credits = row.creditCost;
  const policy = text(row, 'mutationPolicy');
  return summaryCard(
    text(row, 'title') || text(row, 'name'),
    [
      ...fact('Name', text(row, 'title') ? text(row, 'name') : ''),
      ...fact('Toolset', words(text(row, 'toolset'))),
      ...(typeof credits === 'number' && credits > 0
        ? fact('Cost', `${formatAmount(credits)} credits`)
        : []),
      ...(policy && policy !== 'direct'
        ? [
            {
              label: 'Runs',
              status: 'pending_approval',
              value: 'After approval',
            },
          ]
        : []),
    ],
    {
      description: text(row, 'description').split('\n')[0].slice(0, 600),
      id: text(row, 'name'),
    },
  );
}

/**
 * `find_tools`: its structured result has no `data` envelope. A listing shows
 * the toolsets, a search the matching tools, and a lookup the one tool with
 * whether this connection lists it.
 */
export function buildToolDiscoveryView(
  content: Record<string, unknown>,
): McpCardView | undefined {
  if (Array.isArray(content.toolsets)) {
    const toolsets = rows(content.toolsets);
    return {
      cards: toolsets.map((row) =>
        summaryCard(
          words(text(row, 'name')),
          [
            ...metric('Tools', row.toolCount).map((item) => ({
              label: 'Tools',
              value: item.value,
            })),
            ...(row.isAlwaysOn === true
              ? [{ label: 'Loaded', status: 'active', value: 'Always on' }]
              : []),
          ],
          {
            description: text(row, 'description'),
            id: text(row, 'name'),
          },
        ),
      ),
      layout: 'cards',
      title: 'Toolsets',
      total: toolsets.length,
    };
  }
  if (Array.isArray(content.tools)) {
    const tools = rows(content.tools);
    return {
      cards: tools.slice(0, 24).map(toolCard),
      layout: 'cards',
      title: 'Tools',
      total: tools.length,
    };
  }
  const tool = record(content.tool);
  if (!text(tool, 'name')) return undefined;
  const meta = record(tool._meta);
  const connection = record(content.connection);
  const card = toolCard({
    ...tool,
    creditCost: meta[MCP_CREDIT_COST_META_KEY],
    mutationPolicy: meta[MCP_MUTATION_POLICY_META_KEY],
    toolset: text(connection, 'toolset') || meta[MCP_TOOLSET_META_KEY],
  });
  return single('Tool', {
    ...card,
    facts: [
      ...(card.facts ?? []),
      ...(typeof connection.isListed === 'boolean'
        ? [
            connection.isListed
              ? { label: 'This connection', status: 'active', value: 'Listed' }
              : {
                  label: 'This connection',
                  status: 'needs_attention',
                  value: 'Not listed',
                },
          ]
        : []),
    ],
  });
}

/** Builders keyed by the tool name that reaches the card layer. */
export function buildToolView(
  name: string,
  payload: unknown,
): McpCardView | 'media' | undefined {
  const data = record(payload);
  switch (name) {
    case 'get_generation_options':
      return buildGenerationOptionsView(data);
    case 'set_generation_settings':
      return buildGenerationSettingsView(data);
    case 'enhance_prompt':
      return buildEnhancePromptView(data);
    case 'generate_turbo_content':
      return buildTurboRunView(data);
    case 'repurpose_post':
      return buildRepurposeView(data);
    case 'manage_campaign':
      return buildCampaignView(payload);
    case 'onboard_brand':
      return buildOnboardingView(data);
    case 'request_media_upload':
      return buildUploadRequestView(data);
    case 'complete_media_upload':
      return buildUploadCompleteView(data);
    default:
      return undefined;
  }
}
