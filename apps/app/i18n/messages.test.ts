import {
  ACTIVITY_MESSAGE_ID_BY_KEY,
  ActivityKey,
  getActivityMessageDescriptor,
} from '@genfeedai/contracts';
import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { loadMessages, mergeMessagesWithEnglish } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

function resolveMessageId(
  messages: Record<string, unknown>,
  id: string,
): unknown {
  return id.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, messages);
}

describe('loadMessages', () => {
  it('serves the English catalog for the default locale', () => {
    expect(loadMessages(DEFAULT_LOCALE).common.actions.save).toBe('Save');
  });

  it('derives the pseudo-locale from the English catalog at load time', () => {
    expect(loadMessages(PSEUDO_LOCALE).common.actions.save).toBe(
      pseudoLocalizeMessage('Save'),
    );
  });

  it('keeps the pseudo-locale key-for-key identical to English', () => {
    const collectKeys = (
      messages: Record<string, unknown>,
      prefix = '',
    ): string[] =>
      Object.entries(messages).flatMap(([key, value]) =>
        typeof value === 'string'
          ? [`${prefix}${key}`]
          : collectKeys(value as Record<string, unknown>, `${prefix}${key}.`),
      );

    expect(collectKeys(loadMessages(PSEUDO_LOCALE))).toEqual(
      collectKeys(loadMessages(DEFAULT_LOCALE)),
    );
  });

  it('does not mutate the English catalog when building the pseudo-locale', () => {
    loadMessages(PSEUDO_LOCALE);

    expect(loadMessages(DEFAULT_LOCALE).common.actions.save).toBe('Save');
  });

  it('falls back to English for keys missing from a non-default locale', () => {
    const messages = mergeMessagesWithEnglish({
      common: {
        actions: {
          save: 'Localized save',
        },
      },
    });

    expect(messages.common.actions.save).toBe('Localized save');
    expect(messages.common.activity.post.ready).toBe(
      'Content is ready for review',
    );
  });

  it('covers every ActivityKey with a resolvable English message id', () => {
    const activityKeys = Object.values(ActivityKey).toSorted();
    const catalogKeys = Object.keys(ACTIVITY_MESSAGE_ID_BY_KEY).toSorted();
    const english = loadMessages(DEFAULT_LOCALE).common as Record<
      string,
      unknown
    >;

    expect(catalogKeys).toEqual(activityKeys);

    for (const key of activityKeys) {
      const descriptor = getActivityMessageDescriptor(key);
      expect(ACTIVITY_MESSAGE_ID_BY_KEY[key]).toBe(descriptor.id);
      expect(resolveMessageId(english, descriptor.id)).toEqual(
        expect.any(String),
      );
    }
  });

  it('serves the operational home copy the surfaces resolve by id', () => {
    const english = loadMessages(DEFAULT_LOCALE).common as Record<
      string,
      unknown
    >;

    expect(resolveMessageId(english, 'actions.retry')).toBe('Retry');
    expect(resolveMessageId(english, 'home.approvals.open')).toBe('Open queue');
    expect(resolveMessageId(english, 'home.approvals.empty')).toBe(
      'Nothing is waiting for review.',
    );
    expect(resolveMessageId(english, 'home.publishing.open')).toBe(
      'Open publishing',
    );
    expect(resolveMessageId(english, 'home.publishing.empty')).toBe(
      'No publishing runs yet. Drafts created through MCP will appear here.',
    );
    expect(resolveMessageId(english, 'home.schedule.open')).toBe(
      'Open calendar',
    );
    expect(resolveMessageId(english, 'home.schedule.empty')).toBe(
      'Nothing is scheduled for the next 7 days.',
    );
    expect(resolveMessageId(english, 'home.credentials.manage')).toBe(
      'Manage accounts',
    );
    expect(resolveMessageId(english, 'home.activity.open')).toBe(
      'View activity',
    );
  });

  it('serves the post editor copy the publish editor resolves by id', () => {
    const english = loadMessages(DEFAULT_LOCALE).common as Record<
      string,
      unknown
    >;

    expect(resolveMessageId(english, 'postEditor.content')).toBe('Content');
    expect(resolveMessageId(english, 'postEditor.format.standard')).toBe(
      'Standard post',
    );
    expect(resolveMessageId(english, 'postEditor.format.longForm')).toBe(
      'Long post',
    );
    expect(resolveMessageId(english, 'postEditor.format.thread')).toBe(
      'Thread',
    );
    expect(resolveMessageId(english, 'postEditor.status.draft')).toBe('Draft');
    expect(resolveMessageId(english, 'postEditor.status.scheduled')).toBe(
      'Scheduled',
    );
    expect(resolveMessageId(english, 'postEditor.thread.title')).toBe(
      'Thread replies',
    );
    expect(resolveMessageId(english, 'postEditor.thread.help')).toBe(
      'Replies publish in this order through the existing schedule.',
    );
    expect(resolveMessageId(english, 'postEditor.thread.postIndex')).toBe(
      'Post {index}',
    );
  });

  it('serves shared-package namespaces from the host catalog', () => {
    const english = loadMessages(DEFAULT_LOCALE);

    expect(english.agent.publishPostCard.caption).toBe('Caption');
    expect(english.agent.postingSets.label).toBe('Posting set');
    expect(english.agent.schedulePostCard.timezone).toBe('Timezone');
    expect(english.agent.publishPostCard.scheduleForLater).toBe(
      'Schedule for later',
    );
    expect(english.agent.brandIdentityConfirmation.labelField).toBe(
      'Brand label',
    );
    expect(english.agent.settings.autoLabel).toBe('Auto');
    expect(english.agent.composerToolbar.actions).toBe('Workspace shortcuts');
    expect(english.agent.composerToolbar.noModelsEnabled).toBe(
      'No models enabled',
    );
    expect(english.agent.generationActionCard.acceptFullRun).toBe(
      'Accept full run',
    );
    expect(english.agent.generationActionCard.durationSeconds).toBe(
      '{seconds}s',
    );
    expect(english.agent.generationActionCard.pilotReady).toBe('Pilot ready');
    expect(english.agent.generationActionCard.rejectPilot).toBe('Reject');
    expect(english.agent.generationActionCard.loadingModels).toBe(
      'Loading Genfeed models…',
    );
    expect(english.agent.generationActionCard.noModelsEnabled).toBe(
      'No models enabled',
    );
    expect(english.agent.generationActionCard.previewEditorAria).toBe(
      'Full prompt',
    );
    expect(english.agent.generationActionCard.promptLabel).toBe('Prompt');
    expect(english.agent.generationActionCard.readFull).toBe('Read & edit');
    expect(english.pages.remixBrief.errors.saveFailed).toBe(
      'The on-brand remix brief could not be saved.',
    );
    expect(english.pages.adsResearch.errors.remixUnavailable).toBe(
      'The on-brand remix workflow is unavailable here.',
    );
    expect(english.pages.studioGenerate.remixRun.sendToReview).toBe(
      'Send {count} to Review',
    );
    expect(english.pages.posts.list.loadError).toBe(
      'Posts could not be loaded. Refresh to try again.',
    );
    expect(english.pages.posts.list.toolbar.notPosted).toBe('Not posted');
    expect(english.pages.posts.list.views.posted.title).toBe('Posted');
  });

  it('serves the source-post variation copy used by the remix surface', () => {
    const english = loadMessages(DEFAULT_LOCALE).common as Record<
      string,
      unknown
    >;

    expect(resolveMessageId(english, 'sourcePostVariations.title')).toBe(
      'Generate brand-voice variations',
    );
    expect(
      resolveMessageId(english, 'sourcePostVariations.results.noPadding'),
    ).toBe('No duplicate placeholder was added.');
    expect(
      resolveMessageId(
        english,
        'sourcePostVariations.results.organizationDefaults',
      ),
    ).toBe('Organization defaults (no brand voice configured)');
  });
});
