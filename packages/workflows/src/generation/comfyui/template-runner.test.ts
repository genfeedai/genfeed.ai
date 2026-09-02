import type {
  ComfyUIHistoryEntry,
  ComfyUIWorkflowTemplate,
} from '@genfeedai/types';
import { describe, expect, it, vi } from 'vitest';
import type { ComfyUIClient } from './client';
import { ComfyUITemplateRunner } from './template-runner';

function template(): ComfyUIWorkflowTemplate {
  return {
    inputs: [
      {
        field: 'text',
        key: 'prompt',
        nodeId: '1',
        required: true,
        type: 'string',
      },
      {
        default: 7,
        field: 'seed',
        key: 'seed',
        nodeId: '2',
        type: 'number',
      },
      {
        field: 'enabled',
        key: 'optional',
        nodeId: '2',
        type: 'boolean',
      },
    ],
    prompt: {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: 'original' } },
      '2': { class_type: 'KSampler', inputs: { seed: 1 } },
    },
  };
}

describe('ComfyUITemplateRunner', () => {
  it('deep-clones the template and injects provided and default values', () => {
    const source = template();
    const runner = new ComfyUITemplateRunner({} as ComfyUIClient);

    const prompt = runner.resolvePrompt(source, { prompt: 'A lighthouse' });

    expect(prompt).toEqual({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: 'A lighthouse' } },
      '2': { class_type: 'KSampler', inputs: { seed: 7 } },
    });
    expect(source.prompt['1']?.inputs.text).toBe('original');
    expect(source.prompt['2']?.inputs.seed).toBe(1);
  });

  it('preserves false and zero input values', () => {
    const runner = new ComfyUITemplateRunner({} as ComfyUIClient);

    const prompt = runner.resolvePrompt(template(), {
      optional: false,
      prompt: '',
      seed: 0,
    });

    expect(prompt['1']?.inputs.text).toBe('');
    expect(prompt['2']?.inputs).toEqual({ enabled: false, seed: 0 });
  });

  it('uses a default for a nullish value', () => {
    const runner = new ComfyUITemplateRunner({} as ComfyUIClient);

    const prompt = runner.resolvePrompt(template(), {
      prompt: 'A lighthouse',
      seed: null,
    });

    expect(prompt['2']?.inputs.seed).toBe(7);
  });

  it('rejects a missing required input', () => {
    const runner = new ComfyUITemplateRunner({} as ComfyUIClient);

    expect(() => runner.resolvePrompt(template(), {})).toThrow(
      'Missing required input: prompt',
    );
  });

  it('rejects a populated input that references an unknown node', () => {
    const source = template();
    const firstInput = source.inputs[0];
    if (!firstInput) throw new Error('Expected the template input fixture');
    source.inputs[0] = { ...firstInput, nodeId: 'missing' };
    const runner = new ComfyUITemplateRunner({} as ComfyUIClient);

    expect(() =>
      runner.resolvePrompt(source, { prompt: 'A lighthouse' }),
    ).toThrow('Template references unknown node: missing');
  });

  it('queues the resolved prompt and waits for the returned prompt ID', async () => {
    const completed: ComfyUIHistoryEntry = {
      outputs: {},
      prompt: [0, 'queued-1', {}, {}],
      status: { completed: true, messages: [], status_str: 'success' },
    };
    const client = {
      queuePrompt: vi.fn().mockResolvedValue({
        node_errors: {},
        number: 1,
        prompt_id: 'queued-1',
      }),
      waitForCompletion: vi.fn().mockResolvedValue(completed),
    } as unknown as ComfyUIClient;
    const runner = new ComfyUITemplateRunner(client);

    await expect(
      runner.run(template(), { prompt: 'A lighthouse', seed: 99 }),
    ).resolves.toEqual(completed);
    expect(client.queuePrompt).toHaveBeenCalledWith({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: 'A lighthouse' } },
      '2': { class_type: 'KSampler', inputs: { seed: 99 } },
    });
    expect(client.waitForCompletion).toHaveBeenCalledWith('queued-1');
  });
});
