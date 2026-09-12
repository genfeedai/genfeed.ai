import { describe, expect, it } from 'vitest';
import { isEventFromHandle } from './canvasEvents';

describe('isEventFromHandle', () => {
  it('returns false for a null target', () => {
    expect(isEventFromHandle(null)).toBe(false);
  });

  it('returns false for a non-Element target', () => {
    expect(isEventFromHandle({} as EventTarget)).toBe(false);
  });

  it('returns false when the target is outside any handle', () => {
    const node = document.createElement('div');
    node.className = 'react-flow__node';
    expect(isEventFromHandle(node)).toBe(false);
  });

  it('returns true when the target is the handle element itself', () => {
    const handle = document.createElement('div');
    handle.className = 'react-flow__handle react-flow__handle-right source';
    expect(isEventFromHandle(handle)).toBe(true);
  });

  it('returns true when the target is nested inside a handle', () => {
    const handle = document.createElement('div');
    handle.className = 'react-flow__handle';
    const inner = document.createElement('span');
    handle.appendChild(inner);
    expect(isEventFromHandle(inner)).toBe(true);
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
