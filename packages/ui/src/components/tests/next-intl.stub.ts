type MessageNode = string | { readonly [key: string]: MessageNode };

export type MessageCatalog = Readonly<Record<string, MessageNode>>;

const CARDINAL_PLURAL_PATTERN =
  /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g;

function interpolateMessage(
  message: string,
  values?: Record<string, string | number>,
): string {
  const withPlurals = message.replace(
    CARDINAL_PLURAL_PATTERN,
    (token, name: string, singular: string, plural: string) => {
      const value = values?.[name];

      if (typeof value !== 'number') {
        return token;
      }

      return (value === 1 ? singular : plural).replaceAll('#', String(value));
    },
  );

  return withPlurals.replace(/\{(\w+)\}/g, (token, name: string) =>
    values?.[name] === undefined ? token : String(values[name]),
  );
}

/**
 * Creates the `useTranslations` test double used by shared UI packages.
 *
 * The caller owns the catalog. Host-app tests pass the real message tree,
 * while package tests pass only the messages their package contract renders.
 * Missing keys return their full path so absent fixtures fail visibly instead
 * of producing a misleading blank label.
 */
export function createTranslateFromCatalog(catalog: MessageCatalog) {
  return (namespace: string) =>
    (key: string, values?: Record<string, string | number>): string => {
      const path = `${namespace}.${key}`;
      let node: MessageNode = catalog;

      for (const segment of path.split('.')) {
        if (typeof node === 'string') {
          return path;
        }

        const next: MessageNode | undefined = node[segment];

        if (next === undefined) {
          return path;
        }

        node = next;
      }

      if (typeof node !== 'string') {
        return path;
      }

      return interpolateMessage(node, values);
    };
}

const UI_TEST_MESSAGES = {
  common: {
    libraryCanvas: {
      fit: 'Fit',
      fitBoard: 'Fit board',
      loading: 'Loading… {count} so far',
      noPreview: 'No preview',
      videoBadge: 'Video',
    },
    selectionActions: {
      count: '{count} selected',
      download: 'Download',
      merge: 'Merge',
    },
    libraryRetry: {
      genericFailureReason: 'Generation failed.',
      retry: 'Retry',
      retryAriaLabel: 'Retry generation',
    },
    modelProviderContract: {
      empty: 'No reviewed or pending provider contract is stored yet.',
      error: 'Provider contract details could not be loaded.',
      familyLabel: 'Family:',
      field: {
        default: 'default {value}',
        maximum: 'max {value}',
        minimum: 'min {value}',
        required: 'required',
        structuredValue: 'structured value',
      },
      inputSchema: 'Input schema',
      lastSeenLabel: 'Last seen:',
      loading: 'Loading contract details…',
      noTopLevelFields: 'No top-level fields.',
      outputSchema: 'Output schema',
      pendingReview: 'Pending review',
      pricingLabel: 'Pricing:',
      reviewedRuntime: 'Reviewed runtime',
      title: 'Provider contract',
      versionLabel: 'Version:',
    },
    previews: {
      approximatePreview: 'Approximate preview',
      emptyCaption: 'No caption yet',
      firstComment: 'First comment',
      mediaAlt: 'Post media',
    },
  },
  agent: {
    composerToolbar: {
      addContext: 'Add context',
      attachFiles: 'Attach files',
      referenceLibrary: 'Reference library content',
    },
    generationSetup: {
      agentPick: 'Agent pick',
      applyPreset: 'Apply preset {label}',
      aspectRatio: 'Aspect ratio',
      auto: 'Auto',
      brandVoice: 'Brand voice',
      customize: 'Customize',
      customizeSetup: 'Customize setup',
      current: 'Current',
      deletePreset: 'Delete preset {label}',
      duration: 'Duration',
      durationSeconds: '{seconds}s',
      editField: 'Edit {field}',
      loadingPresets: 'Loading presets…',
      model: 'Model',
      noMatchingFields: 'No matching fields',
      noModels: 'No models found',
      noPresets: 'No saved presets yet.',
      off: 'Off',
      on: 'On',
      outputs: 'Outputs',
      pinned: 'Pinned: {label}',
      presets: 'Presets',
      promptEnhance: 'Prompt enhance',
      searchFields: 'Search fields…',
      searchSetupFields: 'Search setup fields',
      type: 'Type',
    },
    postingSets: {
      disconnected: 'Disconnected',
      expanding: 'Expanding posting set…',
      label: 'Posting set',
      none: 'No posting set',
      placeholder: 'Apply a saved set',
      save: 'Save set',
      saveLabel: 'Save current channels as a set',
      savePlaceholder: 'Set name',
      saving: 'Saving…',
      selectAria: 'Saved posting set',
      signatures: 'Posting signature',
    },
    postSidebarSchedule: {
      musicConfirmation: 'Music Usage Confirmation',
      musicConfirmationPrefix: 'By publishing, you agree to TikTok’s',
      publishViaTikTokApp: 'Publish via TikTok App',
      publishViaTikTokAppDescription:
        'Add TikTok-licensed music or make final edits before publishing.',
      scheduledTime: 'Scheduled time',
    },
    schedulePostCard: {
      cannotSchedule: 'Cannot confirm this channel',
      channels: 'Channels',
      confirmSchedule: 'Schedule',
      defaultTitle: 'Schedule Post',
      noChannels: 'No connected channels are available for this brand.',
      scheduled:
        'Post scheduled for {count, plural, one {# platform} other {# platforms}}',
      scheduling: 'Scheduling…',
      timezone: 'Timezone',
      timezoneAria: 'Schedule timezone',
      validationRequired: 'Choose a time and at least one healthy channel.',
    },
  },
  pages: {
    library: {
      inspector: {
        type: 'Type',
      },
      otherAssets: 'Other assets',
    },
    publish: {
      calendar: {
        schedule: 'Schedule',
        scheduleAt: 'Schedule at {label}',
      },
    },
  },
} as const satisfies MessageCatalog;

/** Package-owned next-intl stub with only the UI messages exercised in tests. */
export const translateFromCatalog =
  createTranslateFromCatalog(UI_TEST_MESSAGES);
