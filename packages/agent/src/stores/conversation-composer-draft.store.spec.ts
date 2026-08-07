import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearConversationComposerDraft,
  readConversationComposerDraft,
  writeConversationComposerAttachments,
  writeConversationComposerContentReferences,
  writeConversationComposerDocument,
  writeConversationComposerFocusIntent,
} from './conversation-composer-draft.store';

describe('conversation composer draft persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores document, attachments, content references, and focus by scoped key', () => {
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
    writeConversationComposerFocusIntent(scopeKey, true);

    expect(readConversationComposerDraft(scopeKey)).toMatchObject({
      attachments: [expect.objectContaining({ ingredientId: 'ingredient-1' })],
      contentReferences: [
        expect.objectContaining({
          id: 'post-1',
          thumbnailUrl: 'https://cdn.example/launch.jpg',
        }),
      ],
      document,
      hasFocusIntent: true,
      plainText: 'Draft',
    });
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
});
