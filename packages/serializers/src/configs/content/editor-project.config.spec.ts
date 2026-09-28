import { buildSerializer } from '@serializers/builders';
import { editorProjectSerializerConfig } from '@serializers/configs/content/editor-project.config';
import { describe, expect, it } from 'vitest';

describe('editor project serializer lock contract', () => {
  const { EditorProjectSerializer } = buildSerializer(
    'server',
    editorProjectSerializerConfig,
  );

  it('marks a composition-backed project as locked', () => {
    const output = EditorProjectSerializer.serialize({
      config: { composition: { id: 'product-story' }, name: 'Launch' },
      id: 'project-1',
      name: 'Launch',
    });

    expect(output.data).toMatchObject({
      attributes: { isLocked: true, name: 'Launch' },
      id: 'project-1',
      type: 'editor-project',
    });
  });

  it('marks a project without a composition record as unlocked', () => {
    const output = EditorProjectSerializer.serialize({
      config: { name: 'Draft' },
      id: 'project-2',
      name: 'Draft',
    });

    expect(output.data).toMatchObject({
      attributes: { isLocked: false },
    });
  });

  it('treats a missing or malformed config as unlocked', () => {
    const output = EditorProjectSerializer.serialize([
      { id: 'project-3' },
      { config: null, id: 'project-4' },
      { config: [], id: 'project-5' },
    ]);

    expect(
      (output.data as Array<{ attributes: { isLocked: boolean } }>).map(
        (item) => item.attributes.isLocked,
      ),
    ).toEqual([false, false, false]);
  });
});
