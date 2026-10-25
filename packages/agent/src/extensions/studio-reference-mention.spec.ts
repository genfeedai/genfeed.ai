import { createStudioCharacterMentionExtension } from '@genfeedai/agent/extensions/studio-character-mention';
import {
  STUDIO_REFERENCES_CHANGED,
  StudioReferenceMention,
  studioMentionSuggestions,
} from '@genfeedai/agent/extensions/studio-reference-mention';
import type { StudioReferenceMention as Reference } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import { applyCharacterMentionsToSubmit } from '@genfeedai/helpers/content/character-mention.util';
import {
  numberReferenceMentions,
  validateReferenceMentions,
} from '@genfeedai/helpers/content/reference-mention.util';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';

const characters = [
  {
    id: 'anna',
    label: 'Anna',
    handle: 'anna',
    hasReferenceImage: true,
    referenceIngredientIds: ['portrait'],
  },
];
function refs(ids: string[]): Reference[] {
  return numberReferenceMentions(
    ids.map((id) => ({
      id,
      key: id,
      kind: 'image',
      name: id,
      role: 'reference',
      source: 'library',
    })),
  );
}
const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((editor) => {
    editor.destroy();
  });
});

function createEditor(getReferences: () => Reference[]) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      createStudioCharacterMentionExtension(() => characters).configure({
        suggestion: { allow: () => false },
      }),
      StudioReferenceMention.configure({
        getReferences,
        getCharacters: () => characters,
      }),
    ],
  });
  editors.push(editor);
  return editor;
}

describe('Studio reference mention editor', () => {
  it('offers references by token/name/role alongside existing characters, reserving slot handles', () => {
    const options = {
      getReferences: () => refs(['person', 'place']),
      getCharacters: () => [
        ...characters,
        { ...characters[0], id: 'collision', handle: 'Image1' },
      ],
    };
    expect(
      studioMentionSuggestions(options, '').map(({ kind }) => kind),
    ).toEqual(['reference', 'reference', 'character']);
    expect(studioMentionSuggestions(options, 'Image1')[0]?.kind).toBe(
      'reference',
    );
    expect(studioMentionSuggestions(options, 'anna')[0]?.kind).toBe(
      'character',
    );
  });

  it('serializes chips as literal tokens with ordered per-kind IDs and characters appended', () => {
    const references = numberReferenceMentions([
      {
        id: 'person',
        key: 'person',
        kind: 'image',
        name: 'Person',
        role: 'reference',
        source: 'library',
      },
      {
        id: 'driver',
        key: 'driver',
        kind: 'video',
        name: 'Driver',
        role: 'videoReference',
        source: 'library',
      },
      {
        id: 'place',
        key: 'place',
        kind: 'image',
        name: 'Place',
        role: 'reference',
        source: 'library',
      },
      {
        id: 'voice',
        key: 'voice',
        kind: 'audio',
        name: 'Voice',
        role: 'audioReference',
        source: 'library',
      },
    ]);
    const editor = createEditor(() => references);
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            ...references.flatMap((reference) => [
              {
                type: 'referenceMention',
                attrs: {
                  id: reference.id,
                  key: reference.key,
                  label: reference.token,
                },
              },
              { type: 'text', text: ' ' },
            ]),
            {
              type: 'characterMention',
              attrs: { id: 'anna', handle: 'anna', label: 'Anna' },
            },
          ],
        },
      ],
    });
    const text = editor.getText();
    expect(text).toBe('@Image1 @Video1 @Image2 @Audio1 Anna');
    const prepared = applyCharacterMentionsToSubmit({
      catalog: characters,
      document: editor.getJSON(),
      existingReferenceIds: references
        .filter((reference) => reference.kind === 'image')
        .map((reference) => reference.id),
      text,
    });
    expect(prepared).toEqual({
      text,
      referenceIds: ['person', 'place', 'portrait'],
      notices: [],
    });
    expect(
      references
        .filter((reference) => reference.kind === 'video')
        .map((reference) => reference.id),
    ).toEqual(['driver']);
    expect(
      references
        .filter((reference) => reference.kind === 'audio')
        .map((reference) => reference.id),
    ).toEqual(['voice']);
    expect(
      validateReferenceMentions(text, references, editor.getJSON()).errors,
    ).toEqual([]);
  });

  it('updates surviving chip text on reorder/removal and blocks stale identities', () => {
    let references = refs(['first', 'second']);
    const editor = createEditor(() => references);
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: references.flatMap((reference) => [
            {
              type: 'referenceMention',
              attrs: {
                id: reference.id,
                key: reference.key,
                label: reference.token,
              },
            },
            { type: 'text', text: ' ' },
          ]),
        },
      ],
    });
    references = refs(['second', 'first']);
    editor.view.dispatch(
      editor.state.tr.setMeta(STUDIO_REFERENCES_CHANGED, true),
    );
    expect(editor.getText()).toBe('@Image2 @Image1 ');
    references = refs(['second']);
    editor.view.dispatch(
      editor.state.tr.setMeta(STUDIO_REFERENCES_CHANGED, true),
    );
    expect(editor.getText()).toBe('@Image0 @Image1 ');
    expect(editor.getHTML()).toContain('data-missing="true"');
    expect(
      validateReferenceMentions(editor.getText(), references, editor.getJSON())
        .errors,
    ).toContain('@Image0 was removed. Reattach it or remove the chip.');
  });
  it('hydrates restored/pasted literal tokens into identity-bound chips and leaves missing zero slots invalid', () => {
    let references = refs(['first', 'second']);
    const editor = createEditor(() => references);
    editor.commands.setContent('Use @Image1 behind @Image2');
    const chips = editor
      .getJSON()
      .content?.[0]?.content?.filter(
        (node) => node.type === 'referenceMention',
      );
    expect(
      chips?.map((node) => ('attrs' in node ? node.attrs?.id : undefined)),
    ).toEqual(['first', 'second']);
    references = refs(['second']);
    editor.view.dispatch(
      editor.state.tr.setMeta(STUDIO_REFERENCES_CHANGED, true),
    );
    expect(editor.getText()).toBe('Use @Image0 behind @Image1');
    const reloaded = createEditor(() => references);
    reloaded.commands.setContent(editor.getText());
    expect(
      validateReferenceMentions(
        reloaded.getText(),
        references,
        reloaded.getJSON(),
      ).errors[0],
    ).toContain('@Image0');
  });
  it('lets a multi-digit slot finish before turning typed tokens into chips', () => {
    const references = refs(
      Array.from({ length: 12 }, (_, index) => `image-${index + 1}`),
    );
    const editor = createEditor(() => references);
    editor.commands.insertContent('@Image1');
    expect(editor.getText()).toBe('@Image1');
    editor.commands.insertContent('2');
    expect(editor.getText()).toBe('@Image12');
    editor.commands.insertContent(' ');
    const chip = editor.getJSON().content?.[0]?.content?.[0];
    expect(chip && 'attrs' in chip ? chip.attrs?.id : undefined).toBe(
      'image-12',
    );
    expect(editor.getText()).toBe('@Image12 ');
  });
});
