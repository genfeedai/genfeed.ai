import type { SourceTool } from '../../../interfaces/source-tool.interface';

const contextProperties = {
  brandId: { type: 'string', description: 'Owning brand ID from get_brands.' },
  campaignId: { type: 'string', description: 'Required for get and update.' },
  name: { type: 'string', maxLength: 200 },
  objective: { type: ['string', 'null'], maxLength: 1000 },
  brief: { type: ['string', 'null'], maxLength: 8000 },
  audience: { type: ['string', 'null'], maxLength: 2000 },
  tone: { type: ['string', 'null'], maxLength: 1000 },
  creativeDirection: { type: ['string', 'null'], maxLength: 4000 },
  assetIds: {
    type: 'array',
    items: { type: 'string' },
    maxItems: 50,
    uniqueItems: true,
    description:
      'Existing same-brand Library asset IDs from list_assets. Replaces membership; [] clears it.',
  },
  startDate: {
    type: ['string', 'null'],
    description: 'ISO 8601 datetime with offset.',
  },
  endDate: {
    type: ['string', 'null'],
    description: 'ISO 8601 datetime with offset.',
  },
  idempotencyKey: {
    type: 'string',
    description: 'Required for create. Reuse on retry.',
  },
  page: { type: 'number', minimum: 1 },
  limit: { type: 'number', minimum: 1, maximum: 50 },
};

export const MCP_CONTENT_CAMPAIGN_TOOLS: SourceTool[] = [
  {
    name: 'manage_campaign',
    description:
      'Manage a native content campaign inside an explicit brand. action list reads campaigns; get reads a campaign and its reusable context/assets; create saves a draft (name and idempotencyKey required); update changes context or replaces asset membership (campaignId required). Campaign objective, audience, tone and creative direction complement inherited brand context. Read the campaign before generating assets, then save returned Library IDs as assetIds. To schedule, use create_scheduled_release with the same brandId and campaignId; existing publishing approval still applies. This tool never publishes or starts ad spend.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'create', 'update'] },
        input: {
          type: 'object',
          additionalProperties: false,
          properties: contextProperties,
          required: ['brandId'],
        },
      },
      required: ['action', 'input'],
    },
  },
];
