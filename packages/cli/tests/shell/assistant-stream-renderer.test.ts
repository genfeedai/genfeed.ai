import { describe, expect, it, vi } from 'vitest';
import { createAssistantStreamRenderer } from '../../src/shell/assistant-stream-renderer';

describe('shell/assistant-stream-renderer', () => {
  it('writes incremental chunks once and appends only the missing finalized suffix', () => {
    const write = vi.fn();
    const renderer = createAssistantStreamRenderer({ prefix: 'Assistant: ', write });

    renderer.onDelta('Hello ');
    renderer.onDelta('world');
    renderer.onFinal('Hello world!');

    expect(write.mock.calls.map(([text]) => text).join('')).toBe('Assistant: Hello world!\n');
    expect(renderer.hasRenderedContent()).toBe(true);
  });

  it('prints a canonical replacement when reconnect gaps make the live prefix diverge', () => {
    const write = vi.fn();
    const renderer = createAssistantStreamRenderer({ prefix: 'Assistant: ', write });

    renderer.onDelta('Hello again');
    renderer.onFinal('Hello recovered world again');

    expect(write.mock.calls.map(([text]) => text).join('')).toBe(
      'Assistant: Hello again\nAssistant: Hello recovered world again\n'
    );
  });

  it('ignores late chunks and duplicate finalization after completion', () => {
    const write = vi.fn();
    const renderer = createAssistantStreamRenderer({ write });

    renderer.onFinal('Done');
    renderer.onDelta(' duplicate');
    renderer.onFinal('Done duplicate');
    renderer.finish();

    expect(write.mock.calls.map(([text]) => text).join('')).toBe('Done\n');
  });
});
