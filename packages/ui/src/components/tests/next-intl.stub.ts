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
 *
 * One translator per namespace is reused across calls, like next-intl's own
 * `useTranslations`, so a component that lists `translate` in a hook
 * dependency array does not re-run that hook on every render under test.
 */
export function createTranslateFromCatalog(catalog: MessageCatalog) {
  const translators = new Map<
    string,
    (key: string, values?: Record<string, string | number>) => string
  >();

  return (namespace: string) => {
    const cached = translators.get(namespace);
    if (cached) {
      return cached;
    }

    const translator = (
      key: string,
      values?: Record<string, string | number>,
    ): string => {
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

    translators.set(namespace, translator);
    return translator;
  };
}

const UI_TEST_MESSAGES = {
  common: {
    appRail: {
      apps: 'Apps',
      more: 'More',
      pin: 'Pin {app}',
      unpin: 'Unpin {app}',
      navigation: 'App navigation',
      goTo: 'Go to {app}',
      opening: 'Opening app.',
      locked: '{app} — locked. Generate your first asset to unlock.',
      workspaceBadge:
        '{count, plural, one {# unread task needing attention} other {# unread tasks needing attention}}',
      agent: {
        label: 'Agent',
        description: 'Ask and execute.',
      },
      workspace: {
        label: 'Workspace',
        description: 'Command center.',
      },
      studio: {
        label: 'Studio',
        description: 'Create assets.',
      },
      library: {
        label: 'Library',
        description: 'Use source assets.',
      },
      publishing: {
        label: 'Publishing',
        description: 'Drafts and posts.',
      },
      messages: {
        label: 'Messages',
        description: 'Reply to audience.',
      },
      discovery: {
        label: 'Discovery',
        description: 'Find winners.',
      },
      analytics: {
        label: 'Analytics',
        description: 'Measure results.',
      },
      automation: {
        label: 'Automation',
        description: 'Run workflows.',
      },
      admin: {
        label: 'Admin',
        description: 'Platform management.',
      },
    },
    sidebar: {
      collapse: 'Collapse sidebar',
      expand: 'Expand sidebar',
    },
    windowChrome: {
      back: 'Back',
      forward: 'Forward',
    },
    contextSidebar: {
      close: 'Close details',
      collapse: 'Collapse details',
      expand: 'Expand details',
      open: 'Open details',
    },
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
      platformDefault: 'Default',
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
    quickActions: {
      editImage: 'Edit image',
      editImageDescription: 'Change this image with an instruction',
      more: 'More',
      groups: { reframe: 'Reframe', convert: 'Convert', prompt: 'Prompt' },
    },
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
    elementPlatformFields: {
      activeHelp: 'Inactive elements are hidden from pickers.',
      activeLabel: 'Active',
      inactive: 'Inactive',
      scopeHeader: 'Scope',
      scopeOrganization: 'Organization',
      scopePlatform: 'Default',
      sortOrderHelp:
        'Lowest first. Platform defaults sort ahead of organization elements.',
      sortOrderLabel: 'Sort order',
    },
    evaluationCard: {
      persuasion: 'Persuasion',
    },
    postDraft: {
      topic: 'What do you want to post about?',
      placeholder: 'Describe an idea, announcement, or topic',
      generate: 'Generate draft',
      generating: 'Generating…',
      failed: 'Could not generate a draft. Please try again.',
      platform: 'Channel',
      account: 'Publishing account',
      noAccount: 'Draft only — connect an account later',
      postContent: 'Post content',
      tweetPlaceholder: 'Write the tweet',
    },
    postComposer: {
      destinations: 'Post to',
      destinationsDescription:
        'Pick one or more accounts, or choose Article or Newsletter to write it in its own editor.',
      noAccounts:
        'No connected accounts yet. Save a draft now and connect an account later.',
      draftOnly: 'No account selected. This saves as a draft.',
      article: 'Article',
      articleHint: 'genfeed.ai blog',
      newsletter: 'Newsletter',
      newsletterHint: 'Email',
      handoff:
        'Article and Newsletter are written in their own editor. Continue to open it.',
      continue: 'Continue',
      splitIntoThread: 'Split into thread',
      splitIntoThreadHelp:
        'Publishes to X as a linked thread, split into posts of 280 characters or fewer.',
      threadCount: '{count} posts in this thread',
      longPostHelp: 'Over 280 characters, X publishes this as a long post.',
      titleOptional: 'Title',
      createThread: 'Create Thread',
      createTitle: 'New post',
      createDescription: 'Write once, then choose where it goes.',
      draftDescription:
        'Write or generate a draft. Connect an account when you are ready to publish',
      draftTitle: 'Create Post',
      editDescription: 'Update the content and details for this post',
      editTitle: 'Edit Post',
      threadReplyDescription: 'Add a new reply to continue the thread',
      threadReplyTitle: 'Add Thread Reply',
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
      review: {
        approve: 'Approve asset',
        reject: 'Reject asset',
        label: 'Review asset',
        saveFailed: 'Could not save your review. Try again.',
      },
      browser: {
        columns: {
          asset: 'Asset',
          created: 'Created',
          model: 'Model',
          origin: 'Origin',
          size: 'Size',
          status: 'Status',
          tags: 'Tags',
          type: 'Type',
        },
      },
      inspector: {
        copyPrompt: 'Copy prompt',
        created: 'Created',
        deletedReference: 'Deleted reference',
        dimensions: 'Dimensions',
        duration: 'Duration',
        failureReason: 'Why it failed',
        file: 'File size',
        format: 'Format',
        hiddenCount:
          '{count, plural, one {# more is not available to you} other {# more are not available to you}}',
        lineageError: 'This could not be loaded right now.',
        madeFrom: 'Made from',
        model: 'Model',
        openPreview: 'Open full-size preview',
        origin: 'Origin',
        prompt: 'Prompt',
        provider: 'Provider',
        showFullPrompt: 'Show full prompt',
        showLess: 'Show less',
        showMore: 'Show more',
        style: 'Style',
        type: 'Type',
        untitled: 'Untitled asset',
        usedIn: 'Used in',
      },
      otherAssets: 'Other assets',
      tags: {
        addTag: 'Add tag',
        alreadyTagged: 'This asset already has “{label}”',
        bulkAdded:
          'Added “{label}” to {changed, plural, one {# asset} other {# assets}}{skipped, plural, =0 {} other {, skipped #}}',
        bulkFailed:
          'Changed {changed}, skipped {skipped}, failed {failed}. Try again for the rest.',
        bulkRemoved:
          'Removed “{label}” from {changed, plural, one {# asset} other {# assets}}{skipped, plural, =0 {} other {, skipped #}}',
        create: 'Create “{label}”',
        createFailed: 'The tag could not be created.',
        emptyGuidance:
          'No tags yet. Tags are for campaign, series, episode, mood or client. Type, origin and folder are already filters. Type a name to create one.',
        emptyHint:
          'No tags yet. Use tags for campaign, series, episode, mood or client.',
        loading: 'Loading tags…',
        moreTags: '+{count}',
        noMatch: 'No matching tag.',
        notTagged: 'This asset does not have “{label}”',
        overLimit: 'Select up to {limit} assets to tag them together',
        removeTag: 'Remove tag {label}',
        scopeDefault: 'Default',
        scopeOrganization: 'All brands',
        searchLabel: 'Search or create a tag',
        searchPlaceholder: 'Search or create a tag…',
        sectionLabel: 'Tags',
        stateAll: 'On every selected asset',
        stateSome: 'On some selected assets',
        tagAction: 'Tag',
        tagSelected:
          '{count, plural, one {Tag # selected asset} other {Tag # selected assets}}',
        vocabularyHint:
          'Tags are for campaign, series, episode, mood or client. Type, origin and folder are already filters.',
        writeFailed: 'The tags could not be updated.',
        confirm: 'Confirm',
        confirmDelete: 'Confirm deleting tag {label}',
        createButton: 'Create',
        deleteTag: 'Delete tag {label}',
        deleted: 'Deleted “{label}”. Its assets are untouched.',
        manageDescription:
          'Rename, recolor or delete tags. Deleting a tag removes it from every asset and keeps the assets. Organization-wide tags are shared by every brand and need an owner or admin.',
        manageFailed:
          'The tag could not be changed. Organization-wide and default tags are managed by an owner or admin.',
        manageTags: 'Manage tags',
        newTagLabel: 'New tag name',
        newTagPlaceholder: 'New tag name…',
        newTagScope: 'Where the new tag is visible',
        organizationTagDenied:
          'Only an organization owner or admin can create an organization-wide tag.',
        readOnly: 'Read-only',
        renameTag: 'Rename tag {label}',
        scopeBrand: 'This brand',
        scopeThisBrand: 'This brand',
        colorLabel: 'Tag color',
        tagBackground: 'Background color of {label}',
        tagColor: 'Color of {label}',
        tagText: 'Text color of {label}',
      },
      videoDetail: {
        availableVersions: 'Available Versions:',
        editInStudio: 'Edit in Studio',
        makeClips: 'Make clips',
        moreVersions: '+{count} more',
        viewMoreVersions: 'View more versions',
      },
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
