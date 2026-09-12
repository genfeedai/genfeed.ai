type MessageNode = string | { readonly [key: string]: MessageNode };

export type MessageCatalog = Readonly<Record<string, MessageNode>>;

const CARDINAL_PLURAL_PATTERN =
  /\{(\w+),\s*plural,\s*((?:[^{}]*\{[^{}]*\})+[^{}]*)\}/g;
const PLURAL_CLAUSE_PATTERN =
  /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;

function selectPluralClause(body: string, value: number): string | undefined {
  const clauses = new Map<string, string>();

  for (const [, selector, text] of body.matchAll(PLURAL_CLAUSE_PATTERN)) {
    clauses.set(selector, text);
  }

  // ICU resolves an exact `=N` clause before the keyword categories.
  return (
    clauses.get(`=${value}`) ??
    (value === 1 ? clauses.get('one') : undefined) ??
    clauses.get('other')
  );
}

function interpolateMessage(
  message: string,
  values?: Record<string, string | number>,
): string {
  const withPlurals = message.replace(
    CARDINAL_PLURAL_PATTERN,
    (token, name: string, body: string) => {
      const value = values?.[name];

      if (typeof value !== 'number') {
        return token;
      }

      const selected = selectPluralClause(body, value);

      return selected === undefined
        ? token
        : selected.replaceAll('#', String(value));
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
    oauth: {
      platformCallback: {
        selectAccount: {
          alreadyConnected: 'Already connected',
          back: 'Go back',
          confirm: 'Use this account',
          confirmError: 'Failed to connect this account. Please try again.',
          confirming: 'Connecting…',
          description:
            'Your account manages more than one eligible account. Choose which one this connection should use.',
          empty: 'No eligible accounts were found.',
          error: 'Failed to load accounts. Please try again.',
          loading: 'Loading accounts…',
          retry: 'Try again',
          title: 'Choose an account',
        },
      },
    },
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
      discoveredAtLabel: 'Discovered:',
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
      instrumental: 'Instrumental',
      loadingPresets: 'Loading presets…',
      lyrics: 'Lyrics',
      lyricsPlaceholder: 'Optional — verses, chorus, structure',
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
      style: 'Style',
      stylePlaceholder: 'e.g. synthwave, upbeat, 80s retro',
      text: 'Text',
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
  ui: {
    brandGenerate: {
      banner: {
        label: 'Describe the banner',
        placeholder: 'A wide banner of…',
        title: 'Generate Banner',
      },
      cancel: 'Cancel',
      generate: 'Generate',
      logo: {
        label: 'Describe the profile picture',
        placeholder: 'A square portrait of…',
        title: 'Generate Profile Picture',
      },
    },
    createThread: {
      addPost: 'Add comment / post',
      attachMedia: 'Attach media',
      attached: '{count} attached',
      cancel: 'Cancel',
      clearMedia: 'Clear media',
      commentMediaUnsupported:
        'This channel publishes comments as text only, so a comment here cannot carry media.',
      compose: 'Compose',
      content: 'Content',
      delay: 'Delay',
      description:
        'Create multiple posts that will be linked together as a thread',
      postsTitle: 'Thread Posts',
      remove: 'Remove',
      title: 'Create Thread',
    },
    postPlatforms: {
      charactersUsed: 'Characters used per channel',
      empty: 'Enable a platform above to configure its publishing content.',
      livePreview: 'Live preview',
      livePreviewDescription:
        'Platform-tuned preview of each enabled channel, updated as you type.',
      settingsDescription:
        'Enable a platform above to customise its title, description, and scheduling options.',
      settingsTitle: 'Platform-Specific Settings',
    },
  },
  pages: {
    library: {
      inspector: {
        type: 'Type',
      },
      otherAssets: 'Other assets',
    },
    publishing: {
      calendar: {
        today: 'Today',
      },
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
