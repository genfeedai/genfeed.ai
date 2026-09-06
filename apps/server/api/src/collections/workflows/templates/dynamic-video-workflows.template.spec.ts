import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { DYNAMIC_VIDEO_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/dynamic-video-workflows.template';
import { getActionDefinition } from '@genfeedai/actions';
import {
  type NodeExecutor,
  TextToSpeechExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

const portrait = {
  id: 'portrait-1',
  imageUrl: 'https://cdn.example.com/portrait.png',
};
const sourceVideo = {
  id: 'original-1',
  videoUrl: 'https://cdn.example.com/original.mp4',
};
const background = {
  id: 'background-1',
  audioUrl: 'https://cdn.example.com/background.mp3',
  status: 'completed',
};
const localizedAudio = {
  id: 'speech-1',
  audioUrl: 'https://cdn.example.com/es.mp3',
  duration: 30,
  status: 'completed',
};

function setup(templateId: string, values: Record<string, unknown>) {
  const template = DYNAMIC_VIDEO_WORKFLOW_TEMPLATES[templateId];
  const converter = new WorkflowEngineConverterService();
  const executable = converter.applyRuntimeInputValues(
    {
      ...template,
      inputVariables: template.inputVariables?.map((variable) => ({
        ...variable,
        required: variable.required ?? false,
      })),
    },
    converter.convertToExecutableWorkflow({
      ...template,
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    }),
    values,
  );
  const engine = new WorkflowEngine({
    retryConfig: {
      maxRetries: 0,
      baseDelayMs: 0,
      maxDelayMs: 0,
      backoffMultiplier: 1,
    },
  });
  const speechResolver = vi.fn(
    async (
      _text: string,
      _voiceId: string,
      _context: unknown,
      node: { id: string; config: Record<string, unknown> },
    ) => ({
      id: node.id,
      audioUrl: `https://app.example.com/musics/${node.id}`,
      duration: 15,
      status: 'completed',
    }),
  );
  const speechExecutor = new TextToSpeechExecutor();
  speechExecutor.setResolver(speechResolver);
  const speech = vi.fn<NodeExecutor>(
    async (node, inputs, context) =>
      (await speechExecutor.execute({ node, inputs, context })).data,
  );
  const lips = vi.fn<NodeExecutor>(async (node) => ({
    id: node.id,
    videoUrl: `https://app.example.com/videos/${node.id}`,
    status: 'completed',
  }));
  const stitch = vi.fn<NodeExecutor>(async () => ({
    video: 'https://app.example.com/videos/stitched',
    videoUrl: 'https://app.example.com/videos/stitched',
  }));
  const mix = vi.fn<NodeExecutor>(async () => ({
    id: 'mixed',
    videoUrl: 'https://app.example.com/videos/mixed',
    status: 'completed',
  }));
  const review = vi.fn<NodeExecutor>(async (_node, inputs) => ({
    media: inputs.get('media'),
    caption: null,
  }));
  const localize = vi.fn<NodeExecutor>(async () => ({
    audio: localizedAudio,
    transcript: {
      text: 'Original',
      segments: [{ start: 0, end: 30, text: 'Original' }],
    },
    translatedScript: 'Spanish',
    segments: [{ start: 0, end: 30, text: 'Spanish' }],
    duration: 30,
  }));
  engine.registerExecutor('textToSpeech', speech);
  engine.registerExecutor('lipSync', lips);
  engine.registerExecutor('videoStitch', stitch);
  engine.registerExecutor('soundOverlay', mix);
  engine.registerExecutor('localizeSpeech', localize);
  engine.registerExecutor('separateDialogue', async () => ({
    audio: background,
    reviewRequired: true,
  }));
  engine.registerExecutor('reviewGate', review);
  engine.registerExecutor('workflow.collect-output', async (_node, inputs) =>
    inputs.get('input'),
  );
  return {
    engine,
    executable,
    speech,
    speechResolver,
    lips,
    stitch,
    mix,
    review,
    localize,
  };
}

describe('dynamic video workflow template integration', () => {
  it('generates speech from scripts and feeds the shared portrait only into image-mode lip sync', async () => {
    const run = setup('generate-speaking-scenes', {
      portrait,
      sceneScriptA: 'First scene',
      sceneScriptB: 'Second scene',
      brandId: 'brand-1',
      voiceId: 'voice-es',
      targetLanguage: 'es',
    });
    const result = await run.engine.execute(run.executable);
    expect(result.status, JSON.stringify([...result.nodeResults])).toBe(
      'completed',
    );
    expect(run.speech).toHaveBeenCalledTimes(2);
    expect(
      run.speech.mock.calls.map(([, inputs]) => inputs.get('text')),
    ).toEqual(['First scene', 'Second scene']);
    expect(run.speechResolver).toHaveBeenCalledTimes(2);
    for (const [, voiceId, , resolvedNode] of run.speechResolver.mock.calls) {
      expect(voiceId).toBe('voice-es');
      expect(resolvedNode.config.language).toBe('es');
    }
    for (const [node, inputs] of run.speech.mock.calls) {
      expect(node.config.voiceId).toBe('voice-es');
      expect(inputs.get('language')).toBe('es');
    }
    for (const [node, inputs] of run.lips.mock.calls) {
      expect(node.config.mode).toBe('image');
      expect(node.config.model).toBe('heygen/avatar');
      expect(inputs.get('image')).toEqual(portrait);
      expect(inputs.has('video')).toBe(false);
      expect(inputs.get('audio')).toEqual(
        expect.objectContaining({ id: expect.any(String), duration: 15 }),
      );
    }
    expect(run.stitch.mock.calls[0][1].get('videos')).toEqual([
      'https://app.example.com/videos/sceneA',
      'https://app.example.com/videos/sceneB',
    ]);
  });

  it('localizes an existing ad and mixes only the audio passed through the approved review port', async () => {
    const run = setup('localize-existing-ad', {
      sourceVideo,
      brandId: 'brand-1',
      targetLanguage: 'es',
      voiceId: 'voice-es',
    });
    const result = await run.engine.execute(run.executable);
    expect(result.status, JSON.stringify([...result.nodeResults])).toBe(
      'completed',
    );
    expect(run.localize.mock.calls[0][1].get('video')).toEqual(sourceVideo);
    const [node, inputs] = run.lips.mock.calls[0];
    expect(node.config.mode).toBe('video');
    expect(inputs.get('video')).toEqual(sourceVideo);
    expect(inputs.get('audio')).toEqual(localizedAudio);
    expect(inputs.has('image')).toBe(false);
    expect(run.review.mock.calls[0][0].config).toMatchObject({
      requireApproval: true,
      autoApproveIfNoResponse: false,
    });
    expect(run.mix.mock.calls[0][1].get('soundUrl')).toEqual(background);
  });

  it('composes an ordered array of existing canonical clips without speech or avatar generation', async () => {
    const videos = [
      { id: 'a', videoUrl: 'https://app.example.com/videos/a' },
      { id: 'b', videoUrl: 'https://app.example.com/videos/b' },
    ];
    const run = setup('compose-video-scenes', {
      inputVideos: videos,
      soundtrack: localizedAudio,
      brandId: 'brand-1',
    });
    const result = await run.engine.execute(run.executable);
    expect(result.status, JSON.stringify([...result.nodeResults])).toBe(
      'completed',
    );
    expect(run.stitch.mock.calls[0][1].get('videos')).toEqual(videos);
    expect(run.mix.mock.calls[0][1].get('soundUrl')).toEqual(localizedAudio);
    expect(run.speech).not.toHaveBeenCalled();
    expect(run.lips).not.toHaveBeenCalled();
  });

  it('uses registered action IDs and target fields declared by their input contracts', () => {
    for (const template of Object.values(DYNAMIC_VIDEO_WORKFLOW_TEMPLATES)) {
      for (const node of template.nodes ?? []) {
        if (node.type !== 'genfeedAction') continue;
        const action = getActionDefinition(String(node.data.config.actionId));
        expect(action).toBeDefined();
        const schema = action?.inputSchema;
        const properties =
          schema && 'properties' in schema ? schema.properties : undefined;
        if (!properties || typeof properties !== 'object') continue;
        for (const edge of template.edges ?? []) {
          if (edge.target === node.id && edge.targetHandle)
            expect(Object.keys(properties)).toContain(edge.targetHandle);
        }
      }
    }
  });

  it('fails before execution when a required source portrait is missing', () => {
    expect(() => setup('generate-speaking-scenes', {})).toThrow(
      'Missing required workflow input: portrait',
    );
  });
});
