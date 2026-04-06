import { describe, expect, it } from 'vitest';

import {
  normalizeNodeTypeForApi,
  normalizeNodeTypeForEditor,
} from './node-type-aliases';

describe('normalizeNodeTypeForEditor', () => {
  it('should map api node types to editor node types', () => {
    expect(normalizeNodeTypeForEditor('ai-generate-image')).toBe('imageGen');
    expect(normalizeNodeTypeForEditor('ai-prompt-constructor')).toBe(
      'promptConstructor',
    );
    expect(normalizeNodeTypeForEditor('workflow-input')).toBe('workflowInput');
    expect(normalizeNodeTypeForEditor('workflow-output')).toBe(
      'workflowOutput',
    );
  });

  it('should pass through unknown node types unchanged', () => {
    expect(normalizeNodeTypeForEditor('brand')).toBe('brand');
    expect(normalizeNodeTypeForEditor('captionGen')).toBe('captionGen');
    expect(normalizeNodeTypeForEditor('reviewGate')).toBe('reviewGate');
  });
});

describe('normalizeNodeTypeForApi', () => {
  it('should map editor node types to api node types', () => {
    expect(normalizeNodeTypeForApi('imageGen')).toBe('ai-generate-image');
    expect(normalizeNodeTypeForApi('promptConstructor')).toBe(
      'ai-prompt-constructor',
    );
    expect(normalizeNodeTypeForApi('workflowInput')).toBe('workflow-input');
    expect(normalizeNodeTypeForApi('workflowOutput')).toBe('workflow-output');
  });

  it('should pass through unknown node types unchanged', () => {
    expect(normalizeNodeTypeForApi('brand')).toBe('brand');
    expect(normalizeNodeTypeForApi('captionGen')).toBe('captionGen');
    expect(normalizeNodeTypeForApi('reviewGate')).toBe('reviewGate');
  });

  it('should be the inverse of normalizeNodeTypeForEditor for mapped types', () => {
    const apiTypes = [
      'ai-generate-image',
      'ai-prompt-constructor',
      'workflow-input',
      'workflow-output',
    ];

    for (const apiType of apiTypes) {
      const editorType = normalizeNodeTypeForEditor(apiType);
      expect(normalizeNodeTypeForApi(editorType)).toBe(apiType);
    }
  });
});
