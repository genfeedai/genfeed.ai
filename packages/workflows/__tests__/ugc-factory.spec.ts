import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  MotionControlNodeData,
  TextToSpeechNodeData,
  WorkflowNode,
} from '@genfeedai/types';
import type { WorkflowJson } from '../src';

describe('UGC Factory Workflow v3', () => {
  let workflow: WorkflowJson;

  const getNodeData = <TData>(nodes: WorkflowNode[], id: string): TData => {
    const node = nodes.find((n) => n.id === id);
    expect(node).toBeDefined();
    return (node as { data: TData }).data;
  };

  beforeAll(() => {
    const filePath = path.resolve(__dirname, '../workflows/ugc-factory.json');
    workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  });

  it('should have valid version 3', () => {
    expect(workflow.version).toBe(3);
  });

  it('should have correct name', () => {
    expect(workflow.name).toBe('UGC Factory');
  });

  it('should have 6 nodes and 5 edges', () => {
    expect(workflow.nodes).toHaveLength(6);
    expect(workflow.edges).toHaveLength(5);
  });

  it('should have all required node types', () => {
    const nodeTypes = workflow.nodes.map((node) => node.type);

    expect(nodeTypes).toContain('prompt');
    expect(nodeTypes).toContain('imageInput');
    expect(nodeTypes).toContain('textToSpeech');
    expect(nodeTypes).toContain('motionControl');
    expect(nodeTypes).toContain('lipSync');
    expect(nodeTypes).toContain('download');
  });

  it('should have valid edges connecting all nodes', () => {
    const nodeIds = new Set(workflow.nodes.map((node) => node.id));
    for (const edge of workflow.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('should have complete pipeline: script → TTS → motion → lipSync → download', () => {
    const edgeMap = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
      edgeMap.get(edge.source)?.push(edge.target);
    }

    // script → TTS
    expect(edgeMap.get('script-input')).toContain('tts-voice');

    // avatar → motion control
    expect(edgeMap.get('avatar-input')).toContain('motion-control');

    // motion → lip sync
    expect(edgeMap.get('motion-control')).toContain('lip-sync');

    // TTS → lip sync
    expect(edgeMap.get('tts-voice')).toContain('lip-sync');

    // lip sync → download output
    expect(edgeMap.get('lip-sync')).toContain('output');
  });

  it('should have TTS node configured with ElevenLabs', () => {
    const ttsData = getNodeData<TextToSpeechNodeData>(
      workflow.nodes,
      'tts-voice',
    );
    expect(ttsData.provider).toBe('elevenlabs');
    expect(ttsData.voice).toBe('rachel');
    expect(ttsData.stability).toBe(0.6);
    expect(ttsData.similarityBoost).toBe(0.8);
  });

  it('should have motion control node with trajectory settings', () => {
    const motionData = getNodeData<MotionControlNodeData>(
      workflow.nodes,
      'motion-control',
    );
    expect(motionData.mode).toBe('video_transfer');
    expect(motionData.duration).toBe(5);
    expect(motionData.aspectRatio).toBe('16:9');
    expect(motionData.trajectoryPoints).toBeDefined();
    expect(Array.isArray(motionData.trajectoryPoints)).toBe(true);
    expect(motionData.motionStrength).toBe(0.3);
  });

  it('should have download node with output name', () => {
    const downloadData = getNodeData<{ outputName: string }>(
      workflow.nodes,
      'output',
    );
    expect(downloadData.outputName).toBe('ugc-video');
  });
});
