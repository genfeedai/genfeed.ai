import { describe, expect, it } from 'vitest';
import {
  buildGenerationEtaSnapshot,
  buildWorkflowEtaSnapshot,
  estimateWorkflowCriticalPath,
  formatEtaDuration,
  formatEtaRange,
  shouldDisplayEta,
} from './generation-eta.helper';

describe('generation eta helper', () => {
  it('estimates images in seconds', () => {
    const snapshot = buildGenerationEtaSnapshot({
      model: 'fal-flux-schnell',
      resolution: '1024x1024',
      type: 'image',
    });

    expect(snapshot?.estimatedDurationMs).toBeGreaterThanOrEqual(5_000);
    expect(snapshot?.estimatedDurationMs).toBeLessThan(20_000);
    expect(snapshot?.etaConfidence).toBe('high');
  });

  it('estimates videos in minutes', () => {
    const snapshot = buildGenerationEtaSnapshot({
      durationSeconds: 10,
      model: 'klingai',
      resolution: '1080p',
      type: 'video',
    });

    expect(snapshot?.estimatedDurationMs).toBeGreaterThan(120_000);
    expect(snapshot?.etaConfidence).toBe('high');
  });

  it('estimates avatars from script length', () => {
    const snapshot = buildGenerationEtaSnapshot({
      promptText:
        'Create a fully edited avatar video that explains the new product launch and includes a strong CTA for the viewer at the end.',
      provider: 'heygen',
      type: 'avatar',
    });

    expect(snapshot?.estimatedDurationMs).toBeGreaterThan(120_000);
    expect(snapshot?.etaConfidence).toBe('medium');
  });

  it('estimates articles from length', () => {
    const snapshot = buildGenerationEtaSnapshot({
      length: 'long',
      model: 'gpt-4.1',
      type: 'article',
    });

    expect(snapshot?.estimatedDurationMs).toBe(35_000);
  });

  it('estimates background tasks from phase text', () => {
    const snapshot = buildGenerationEtaSnapshot({
      currentPhase: 'Video merge',
      type: 'background',
    });

    expect(snapshot?.estimatedDurationMs).toBe(90_000);
  });

  it('reduces remaining time from progress and elapsed time', () => {
    const startedAt = new Date(Date.now() - 10_000).toISOString();
    const snapshot = buildGenerationEtaSnapshot({
      model: 'imagen4',
      progress: 50,
      startedAt,
      type: 'image',
    });

    expect(snapshot?.remainingDurationMs).toBeLessThan(
      snapshot?.estimatedDurationMs ?? Number.POSITIVE_INFINITY,
    );
  });

  it('formats seconds and ranges', () => {
    expect(formatEtaDuration(19_000)).toBe('19s');
    expect(formatEtaRange(18_000)).toBe('13-24s');
  });

  it('suppresses eta below five seconds', () => {
    expect(shouldDisplayEta({ estimatedDurationMs: 3_000 })).toBe(false);
    expect(shouldDisplayEta({ estimatedDurationMs: 7_000 })).toBe(true);
  });
});

describe('workflow eta helper', () => {
  const nodes = [
    {
      config: { model: 'imagen4', prompt: 'cover image' },
      id: 'image',
      type: 'ai-generate-image',
    },
    {
      config: { duration: 10, model: 'klingai', prompt: 'promo video' },
      id: 'video',
      type: 'ai-generate-video',
    },
    {
      config: { length: 'long', model: 'gpt-4.1', topic: 'blog post' },
      id: 'article',
      type: 'ai-generate-article',
    },
  ];

  it('uses the workflow critical path instead of summing all nodes', () => {
    const estimate = estimateWorkflowCriticalPath(nodes, [
      { source: 'image', target: 'video' },
    ]);

    expect(estimate.criticalPathNodeIds).toEqual(['image', 'video']);
    expect(estimate.estimatedDurationMs).toBeGreaterThanOrEqual(
      estimate.remainingDurationMs ?? 0,
    );
    expect(estimate.estimatedDurationMs).toBeLessThan(260_000);
  });

  it('reduces remaining duration after a completed node', () => {
    const estimate = buildWorkflowEtaSnapshot({
      completedNodeIds: ['image'],
      currentPhase: 'Generating Promo Video',
      edges: [{ source: 'image', target: 'video' }],
      nodes,
      startedAt: new Date().toISOString(),
    });

    expect(estimate.currentPhase).toBe('Generating Promo Video');
    expect(estimate.remainingDurationMs).toBeGreaterThan(100_000);
    expect(estimate.remainingDurationMs).toBeLessThan(
      estimate.estimatedDurationMs ?? Number.POSITIVE_INFINITY,
    );
  });

  it('handles skipped nodes when calculating remaining time', () => {
    const estimate = buildWorkflowEtaSnapshot({
      completedNodeIds: ['image'],
      edges: [{ source: 'image', target: 'video' }],
      nodes,
      skippedNodeIds: ['article'],
    });

    expect(estimate.criticalPathNodeIds).toEqual(['video']);
  });

  it('falls back on low confidence when the graph is cyclic', () => {
    const estimate = estimateWorkflowCriticalPath(
      [
        { id: 'a', type: 'brand' },
        { id: 'b', type: 'brand-context' },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
    );

    expect(estimate.etaConfidence).toBe('low');
    expect(estimate.criticalPathNodeIds).toEqual(['a', 'b']);
  });
});
