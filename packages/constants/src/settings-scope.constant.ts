export const SETTINGS_SCOPES = ['organization', 'brand', 'agent'] as const;

export type SettingsScope = (typeof SETTINGS_SCOPES)[number];

export interface SettingsScopeFieldOwner {
  field: string;
  owner: SettingsScope;
  source:
    | 'OrganizationSetting'
    | 'Brand'
    | 'BrandAgentConfig'
    | 'AgentStrategy';
  label: string;
}

export interface SettingsScopeConflict {
  field: string;
  canonicalOwner: SettingsScope;
  competingScopes: SettingsScope[];
  resolution: string;
}

export const SETTINGS_SCOPE_FIELD_OWNERSHIP = [
  {
    field: 'agentPolicy',
    label: 'Workspace agent policy defaults',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'agentPolicy.allowAdvancedOverrides',
    label: 'Advanced override permission',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'agentPolicy.autonomyDefault',
    label: 'Default agent autonomy mode',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'agentPolicy.creditGovernance',
    label: 'Organization credit governance',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'agentPolicy.generationModelOverride',
    label: 'Workspace generation model override',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'agentPolicy.qualityTierDefault',
    label: 'Default quality tier',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'defaultAvatarIngredientId',
    label: 'Organization avatar ingredient fallback',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'defaultAvatarPhotoUrl',
    label: 'Organization avatar photo fallback',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'defaultModel',
    label: 'Organization text model fallback',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'defaultVoiceId',
    label: 'Organization cloned voice fallback',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'defaultVoiceRef',
    label: 'Organization saved voice fallback',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'seats',
    label: 'Workspace seats',
    owner: 'organization',
    source: 'OrganizationSetting',
  },
  {
    field: 'brand.description',
    label: 'Brand description',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'brand.label',
    label: 'Brand display name',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'brand.referenceImages',
    label: 'Brand visual references',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'brand.slug',
    label: 'Brand URL slug',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'brand.text',
    label: 'Brand system prompt',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'brand.theme',
    label: 'Brand colors and typography',
    owner: 'brand',
    source: 'Brand',
  },
  {
    field: 'agentConfig.autoPublish',
    label: 'Brand auto-publish defaults',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.defaultAvatarIngredientId',
    label: 'Brand avatar ingredient override',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.defaultAvatarPhotoUrl',
    label: 'Brand avatar photo override',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.defaultModel',
    label: 'Brand text model override',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.defaultVoiceId',
    label: 'Brand cloned voice override',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.defaultVoiceRef',
    label: 'Brand saved voice override',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.persona',
    label: 'Brand agent persona',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.platformOverrides',
    label: 'Brand platform-specific defaults',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.schedule',
    label: 'Brand posting schedule',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.strategy',
    label: 'Brand strategy defaults',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'agentConfig.voice',
    label: 'Brand voice profile',
    owner: 'brand',
    source: 'BrandAgentConfig',
  },
  {
    field: 'autonomyMode',
    label: 'Agent autonomy override',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'budgetPolicy',
    label: 'Agent budget policy',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'contentMix',
    label: 'Agent content mix',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'dailyCreditBudget',
    label: 'Agent daily credit budget',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'model',
    label: 'Agent model override',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'opportunitySources',
    label: 'Agent opportunity sources',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'platforms',
    label: 'Agent platform targeting',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'postsPerWeek',
    label: 'Agent weekly cadence',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'publishPolicy',
    label: 'Agent publish policy',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'qualityTier',
    label: 'Agent quality tier override',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'rankingPolicy',
    label: 'Agent ranking policy',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'reportingPolicy',
    label: 'Agent reporting policy',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'skillSlugs',
    label: 'Agent skills',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'topics',
    label: 'Agent topics',
    owner: 'agent',
    source: 'AgentStrategy',
  },
  {
    field: 'weeklyCreditBudget',
    label: 'Agent weekly credit budget',
    owner: 'agent',
    source: 'AgentStrategy',
  },
] as const satisfies readonly SettingsScopeFieldOwner[];

export const SETTINGS_SCOPE_CONFLICTS = [
  {
    canonicalOwner: 'brand',
    competingScopes: ['organization'],
    field: 'agentConfig.defaultModel',
    resolution:
      'Organization defaultModel is the workspace fallback; brand agentConfig.defaultModel owns brand-level generation behavior.',
  },
  {
    canonicalOwner: 'brand',
    competingScopes: ['organization'],
    field: 'agentConfig.defaultVoiceRef',
    resolution:
      'Organization defaultVoiceRef is the fallback; brand agentConfig.defaultVoiceRef wins for brand voice generation.',
  },
  {
    canonicalOwner: 'brand',
    competingScopes: ['organization'],
    field: 'agentConfig.defaultVoiceId',
    resolution:
      'Organization defaultVoiceId is the fallback; brand agentConfig.defaultVoiceId wins for brand voice generation.',
  },
  {
    canonicalOwner: 'agent',
    competingScopes: ['organization', 'brand'],
    field: 'model',
    resolution:
      'AgentStrategy.model wins for the strategy run; brand and organization model fields remain fallbacks.',
  },
] as const satisfies readonly SettingsScopeConflict[];

export const getSettingsFieldsByScope = (
  scope: SettingsScope,
): SettingsScopeFieldOwner[] =>
  SETTINGS_SCOPE_FIELD_OWNERSHIP.filter((field) => field.owner === scope);
