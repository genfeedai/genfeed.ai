import type { WorkflowNode } from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';
import type { useWorkflowStore } from '../../workflow/workflowStore';
import { getOutputUpdate } from './outputHelpers';

type WorkflowStoreState = ReturnType<typeof useWorkflowStore.getState>;

function makeStore(nodes: WorkflowNode[]): WorkflowStoreState {
  return {
    getNodeById: (id: string) => nodes.find((node) => node.id === id),
  } as unknown as WorkflowStoreState;
}

function makeNode(
  type: string,
  data: Record<string, unknown> = {},
  id = 'node-1',
): WorkflowNode {
  return {
    data,
    id,
    position: { x: 0, y: 0 },
    type,
  } as WorkflowNode;
}

describe('getOutputUpdate', () => {
  it('returns an empty update for unknown nodes', () => {
    expect(getOutputUpdate('missing', 'url', makeStore([]))).toEqual({});
  });

  describe('imageGen nodes', () => {
    const store = makeStore([makeNode('imageGen')]);

    it('maps a single string output', () => {
      expect(getOutputUpdate('node-1', 'https://img/1.png', store)).toEqual({
        outputImage: 'https://img/1.png',
        outputImages: ['https://img/1.png'],
      });
    });

    it('maps an array of urls', () => {
      const update = getOutputUpdate(
        'node-1',
        ['https://img/1.png', 'https://img/2.png'],
        store,
      );
      expect(update.outputImage).toBe('https://img/1.png');
      expect(update.outputImages).toEqual([
        'https://img/1.png',
        'https://img/2.png',
      ]);
    });

    it('maps an images-array object', () => {
      const update = getOutputUpdate(
        'node-1',
        { images: ['https://img/a.png', 'https://img/b.png'] },
        store,
      );
      expect(update.outputImages).toEqual([
        'https://img/a.png',
        'https://img/b.png',
      ]);
    });

    it('falls back to a single image field', () => {
      const update = getOutputUpdate(
        'node-1',
        { image: 'https://img/only.png' },
        store,
      );
      expect(update.outputImages).toEqual(['https://img/only.png']);
    });

    it('maps empty output to null image', () => {
      expect(getOutputUpdate('node-1', null, store)).toEqual({
        outputImage: null,
        outputImages: [],
      });
    });
  });

  describe('unified reframe/upscale nodes', () => {
    it('routes to outputVideo when inputType is video', () => {
      const store = makeStore([makeNode('reframe', { inputType: 'video' })]);
      expect(getOutputUpdate('node-1', 'https://v.mp4', store)).toEqual({
        outputVideo: 'https://v.mp4',
      });
    });

    it('routes to outputImage otherwise', () => {
      const store = makeStore([makeNode('upscale', { inputType: 'image' })]);
      expect(getOutputUpdate('node-1', 'https://i.png', store)).toEqual({
        outputImage: 'https://i.png',
      });
    });
  });

  describe('video nodes', () => {
    for (const type of [
      'videoGen',
      'animation',
      'videoStitch',
      'lipSync',
      'voiceChange',
      'motionControl',
    ]) {
      it(`maps ${type} output to outputVideo`, () => {
        const store = makeStore([makeNode(type)]);
        expect(getOutputUpdate('node-1', 'https://v.mp4', store)).toEqual({
          outputVideo: 'https://v.mp4',
        });
      });
    }

    it('unwraps an object with a video field', () => {
      const store = makeStore([makeNode('videoGen')]);
      expect(
        getOutputUpdate('node-1', { video: 'https://v.mp4' }, store),
      ).toEqual({ outputVideo: 'https://v.mp4' });
    });
  });

  it('maps textToSpeech output to outputAudio', () => {
    const store = makeStore([makeNode('textToSpeech')]);
    expect(
      getOutputUpdate('node-1', { audio: 'https://a.mp3' }, store),
    ).toEqual({ outputAudio: 'https://a.mp3' });
  });

  describe('llm nodes', () => {
    const store = makeStore([makeNode('llm')]);

    it('joins array outputs into one string', () => {
      expect(getOutputUpdate('node-1', ['Hello, ', 'world'], store)).toEqual({
        outputText: 'Hello, world',
      });
    });

    it('passes through string outputs', () => {
      expect(getOutputUpdate('node-1', 'answer', store)).toEqual({
        outputText: 'answer',
      });
    });
  });

  it('maps resize output to outputMedia', () => {
    const store = makeStore([makeNode('resize')]);
    expect(getOutputUpdate('node-1', { url: 'https://m.png' }, store)).toEqual({
      outputMedia: 'https://m.png',
    });
  });

  it('maps unknown node types to a generic output', () => {
    const store = makeStore([makeNode('prompt')]);
    expect(getOutputUpdate('node-1', 'text', store)).toEqual({
      output: 'text',
    });
  });

  it('unwraps an array of url objects', () => {
    const store = makeStore([makeNode('videoGen')]);
    expect(
      getOutputUpdate('node-1', [{ url: 'https://v.mp4' }], store),
    ).toEqual({ outputVideo: 'https://v.mp4' });
  });
});
