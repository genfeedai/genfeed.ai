import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachContentToConversationDraft,
  attachContentToNewConversationDraft,
  buildConversationComposerDraftScopeKey,
  CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
  clearConversationComposerDraft,
  readConversationComposerDraft,
  writeConversationComposerAttachments,
  writeConversationComposerContentReferences,
  writeConversationComposerDocument,
} from './conversation-composer-draft.store';

describe('conversation composer draft persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores document, attachments, and content references by scoped key', () => {
    const scopeKey = 'acme:thread-1:4';
    const document = {
      content: [
        {
          content: [{ text: 'Draft with a visual reference', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };

    writeConversationComposerDocument(scopeKey, document, 'Draft');
    writeConversationComposerAttachments(scopeKey, [
      {
        id: 'attachment-1',
        ingredientId: 'ingredient-1',
        kind: 'image',
        name: 'reference.png',
        status: 'completed',
        url: 'https://cdn.example/reference.png',
      },
    ]);
    writeConversationComposerContentReferences(scopeKey, [
      {
        contentTitle: 'Launch post',
        contentType: 'post',
        id: 'post-1',
        thumbnailUrl: 'https://cdn.example/launch.jpg',
      },
    ]);

    expect(readConversationComposerDraft(scopeKey)).toMatchObject({
      attachments: [expect.objectContaining({ ingredientId: 'ingredient-1' })],
      contentReferences: [
        expect.objectContaining({
          id: 'post-1',
          thumbnailUrl: 'https://cdn.example/launch.jpg',
        }),
      ],
      document,
      plainText: 'Draft',
    });
  });

  it('preserves an explicitly unbranded post across remounts', () => {
    const reference = {
      brandId: null,
      contentTitle: 'Unbranded',
      contentType: 'text',
      id: 'post-null',
      kind: 'post' as const,
    };
    writeConversationComposerContentReferences('scope', [reference]);
    expect(readConversationComposerDraft('scope').contentReferences).toEqual([
      reference,
    ]);
  });

  it('isolates thread and context versions and clears only the sent draft', () => {
    writeConversationComposerDocument('acme:thread-1:1', { type: 'doc' }, 'A');
    writeConversationComposerDocument('acme:thread-1:2', { type: 'doc' }, 'B');

    clearConversationComposerDraft('acme:thread-1:1');

    expect(readConversationComposerDraft('acme:thread-1:1').plainText).toBe('');
    expect(readConversationComposerDraft('acme:thread-1:2').plainText).toBe(
      'B',
    );
  });

  it('recovers the same thread draft while its server context version hydrates', () => {
    writeConversationComposerDocument(
      'acme:thread-1:3',
      { type: 'doc' },
      'Hydrated draft',
    );

    expect(readConversationComposerDraft('acme:thread-1:0').plainText).toBe(
      'Hydrated draft',
    );
    expect(readConversationComposerDraft('other:thread-1:0').plainText).toBe(
      '',
    );
  });

  it('builds the shell scope key for new and existing threads', () => {
    expect(buildConversationComposerDraftScopeKey('acme', null)).toBe(
      'acme:new:0',
    );
    expect(buildConversationComposerDraftScopeKey('acme', 'thread-1', 4)).toBe(
      'acme:thread-1:4',
    );
    expect(buildConversationComposerDraftScopeKey('', null)).toBe(
      'unknown:new:0',
    );
  });

  it('stages an asset on the next new conversation without touching its text', () => {
    writeConversationComposerDocument(
      'acme:new:0',
      { type: 'doc' },
      'Half-written question',
    );
    const asset = {
      contentTitle: 'Launch still',
      contentType: 'image',
      id: 'ingredient-1',
      thumbnailUrl: 'https://cdn.example/still.png',
    };

    attachContentToNewConversationDraft('acme', asset);
    attachContentToNewConversationDraft('acme', asset);

    const draft = readConversationComposerDraft('acme:new:0');
    expect(draft.contentReferences).toEqual([asset]);
    expect(draft.plainText).toBe('Half-written question');
    expect(
      readConversationComposerDraft('acme:thread-1:0').contentReferences,
    ).toEqual([]);
  });

  it('persists the content reference kind and defaults a legacy record to post', () => {
    const scopeKey = 'acme:thread-1:5';

    writeConversationComposerContentReferences(scopeKey, [
      {
        contentTitle: 'Hero shot',
        contentType: 'image',
        id: 'ingredient-1',
        kind: 'ingredient',
      },
    ]);
    expect(readConversationComposerDraft(scopeKey).contentReferences).toEqual([
      expect.objectContaining({ id: 'ingredient-1', kind: 'ingredient' }),
    ]);

    // A record written before `kind` existed has no `kind` field at all.
    sessionStorage.setItem(
      `genfeed:conversation-composer:v1:${scopeKey}`,
      JSON.stringify({
        attachments: [],
        contentReferences: [
          { contentTitle: 'Launch post', contentType: 'post', id: 'post-1' },
        ],
        document: null,
        plainText: '',
        updatedAt: new Date().toISOString(),
      }),
    );

    const legacy = readConversationComposerDraft(scopeKey).contentReferences;
    expect(legacy).toEqual([expect.objectContaining({ id: 'post-1' })]);
    expect(legacy[0]?.kind).toBeUndefined();
  });

  it('attaches content to a scope and dispatches the draft-updated event', () => {
    const scopeKey = 'acme:thread-1:6';
    const listener = vi.fn();
    window.addEventListener(
      CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
      listener,
    );

    const reference = {
      contentTitle: 'Launch still',
      contentType: 'image',
      id: 'ingredient-1',
      kind: 'ingredient' as const,
    };

    attachContentToConversationDraft(scopeKey, reference);

    expect(readConversationComposerDraft(scopeKey).contentReferences).toEqual([
      reference,
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{
      scopeKey: string | null;
    }>;
    expect(event.detail).toEqual({ scopeKey });

    // Re-attaching the same id dedupes and does not fire again.
    attachContentToConversationDraft(scopeKey, reference);
    expect(
      readConversationComposerDraft(scopeKey).contentReferences,
    ).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(
      CONVERSATION_COMPOSER_DRAFT_UPDATED_EVENT,
      listener,
    );
  });
});
