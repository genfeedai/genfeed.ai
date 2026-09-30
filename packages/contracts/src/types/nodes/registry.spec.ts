import { describe, expect, it } from 'vitest';
import {
  type NodeCategory,
  NodeCategoryEnum,
  NodeStatusEnum,
  type NodeType,
  NodeTypeEnum,
} from './base';
import { CONNECTION_RULES, HandleTypeEnum } from './handles';
import {
  ModelCapabilityEnum,
  ModelUseCaseEnum,
  ProviderTypeEnum,
} from './providers';
import { getNodesByCategory, NODE_DEFINITIONS, NODE_ORDER } from './registry';

describe('node base enums', () => {
  it('defines a NODE_DEFINITIONS entry for every NodeTypeEnum value', () => {
    for (const nodeType of Object.values(NodeTypeEnum)) {
      expect(NODE_DEFINITIONS[nodeType]).toBeDefined();
    }
    expect(Object.keys(NODE_DEFINITIONS)).toHaveLength(
      Object.values(NodeTypeEnum).length,
    );
  });

  it('preserves category and status vocabularies', () => {
    expect(Object.values(NodeCategoryEnum)).toEqual([
      'input',
      'ai',
      'processing',
      'output',
      'composition',
    ]);
    expect(Object.values(NodeStatusEnum)).toEqual([
      'idle',
      'pending',
      'processing',
      'complete',
      'error',
    ]);
  });
});

describe('handle types', () => {
  it('allows every handle type to connect only to itself', () => {
    for (const handleType of Object.values(HandleTypeEnum)) {
      expect(CONNECTION_RULES[handleType]).toEqual([handleType]);
    }
    expect(Object.keys(CONNECTION_RULES)).toHaveLength(
      Object.values(HandleTypeEnum).length,
    );
  });
});

describe('provider enums', () => {
  it('preserves provider identifiers', () => {
    expect(Object.values(ProviderTypeEnum)).toEqual([
      'replicate',
      'fal',
      'openrouter',
      'genfeed-ai',
    ]);
  });

  it('preserves model capability identifiers', () => {
    expect(Object.values(ModelCapabilityEnum)).toEqual([
      'text-to-image',
      'image-to-image',
      'text-to-video',
      'image-to-video',
      'text-generation',
    ]);
  });

  it('preserves model use case identifiers', () => {
    expect(Object.values(ModelUseCaseEnum)).toEqual([
      'style-transfer',
      'character-consistent',
      'image-variation',
      'inpainting',
      'upscale',
      'general',
    ]);
  });
});

describe('NODE_DEFINITIONS', () => {
  it('keeps each definition self-consistent', () => {
    for (const [nodeType, definition] of Object.entries(NODE_DEFINITIONS)) {
      expect(definition.type).toBe(nodeType);
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.icon.length).toBeGreaterThan(0);
      expect(Object.values(NodeCategoryEnum)).toContain(definition.category);
    }
  });

  it('gives every handle a unique id within its side', () => {
    for (const definition of Object.values(NODE_DEFINITIONS)) {
      const inputIds = definition.inputs.map((handle) => handle.id);
      const outputIds = definition.outputs.map((handle) => handle.id);
      expect(new Set(inputIds).size).toBe(inputIds.length);
      expect(new Set(outputIds).size).toBe(outputIds.length);
    }
  });
});

describe('NODE_ORDER', () => {
  it('lists every node type exactly once across all categories', () => {
    const ordered = Object.values(NODE_ORDER).flat();
    expect(new Set(ordered).size).toBe(ordered.length);
    expect(ordered.sort()).toEqual(
      (Object.keys(NODE_DEFINITIONS) as NodeType[]).sort(),
    );
  });

  it('places each node type in its definition category', () => {
    for (const [category, nodeTypes] of Object.entries(NODE_ORDER)) {
      for (const nodeType of nodeTypes) {
        expect(NODE_DEFINITIONS[nodeType].category).toBe(category);
      }
    }
  });
});

describe('getNodesByCategory', () => {
  it('returns definitions grouped and ordered per NODE_ORDER', () => {
    const grouped = getNodesByCategory();
    for (const category of Object.keys(NODE_ORDER) as NodeCategory[]) {
      expect(grouped[category].map((definition) => definition.type)).toEqual(
        NODE_ORDER[category],
      );
    }
  });

  it('returns a fresh grouping on every call', () => {
    expect(getNodesByCategory()).not.toBe(getNodesByCategory());
  });
});
