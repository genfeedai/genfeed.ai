import { describe, expect, it } from 'vitest';
import { isEventFromHandle } from './canvasEvents';

describe('isEventFromHandle', () => {
  it('returns false for a non-Element target', () => {
    expect(isEventFromHandle({} as EventTarget)).toBe(false);
  });

  it('returns false when the target is a sibling of a handle inside the node', () => {
    const node = document.createElement('div');
    node.className = 'workflow-node';
    const handle = document.createElement('div');
    handle.className = 'react-flow__handle';
    const content = document.createElement('div');
    content.className = 'node-content';
    node.append(handle, content);
    expect(isEventFromHandle(content)).toBe(false);
  });
});
