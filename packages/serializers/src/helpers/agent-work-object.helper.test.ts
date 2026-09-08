import { buildSerializer } from '@serializers/builders';
import { ingredientSerializerConfig } from '@serializers/configs/content/ingredient.config';
import { serializeAgentWorkObject } from '@serializers/helpers/agent-work-object.helper';
import { describe, expect, it } from 'vitest';

describe('canonical agent work serialization', () => {
  it('exposes Library content while withholding provider and review internals', () => {
    expect(
      serializeAgentWorkObject({
        providerData: {
          secret: 'private',
          agentWorkObject: {
            kind: 'script',
            title: 'Launch',
            body: 'The script',
            reviewToken: 'private',
            threadId: 'private',
          },
        },
      }),
    ).toEqual({ kind: 'script', title: 'Launch', body: 'The script' });
  });
  it('only exposes declared text cells', () => {
    expect(
      serializeAgentWorkObject({
        providerData: {
          agentWorkObject: {
            kind: 'table',
            title: 'Shots',
            columns: [{ key: 'shot', label: 'Shot' }],
            rows: [{ shot: 'Opening', secret: 'private' }],
          },
        },
      }),
    ).toEqual({
      kind: 'table',
      title: 'Shots',
      columns: [{ key: 'shot', label: 'Shot' }],
      rows: [{ shot: 'Opening' }],
    });
  });
  it('does not fabricate work content for regular ingredients', () => {
    expect(
      serializeAgentWorkObject({ providerData: { model: 'a' } }),
    ).toBeUndefined();
  });
});

it('derives safe Library material through the full serializer for Prisma records and client round trips', () => {
  const { IngredientSerializer } = buildSerializer(
    'server',
    ingredientSerializerConfig,
  );
  const material = {
    kind: 'script',
    title: 'Paper airplane',
    body: 'Fold the wings.',
  };
  const source = {
    id: 'ingredient-work',
    providerData: {
      secret: 'private-provider-field',
      agentWorkObject: {
        ...material,
        reviewToken: 'private-review-token',
        viewedSessionId: 'private-session',
      },
    },
  };
  expect(IngredientSerializer.serialize(source)).toMatchObject({
    data: { attributes: { agentWorkObject: material } },
  });
  expect(JSON.stringify(IngredientSerializer.serialize(source))).not.toContain(
    'private-',
  );
  expect(source).not.toHaveProperty('agentWorkObject');
  expect(
    IngredientSerializer.serialize({
      id: source.id,
      agentWorkObject: material,
    }),
  ).toMatchObject({
    data: { attributes: { agentWorkObject: material } },
  });
  expect(IngredientSerializer.serialize([source])).toMatchObject({
    data: [{ attributes: { agentWorkObject: material } }],
  });
});
