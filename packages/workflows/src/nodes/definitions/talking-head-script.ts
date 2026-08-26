import type {
  TalkingHeadScript,
  TalkingHeadScriptSegment,
} from '../../contracts/talking-head-script';
import type { BaseNodeData } from '../types';

export interface TalkingHeadScriptNodeData extends BaseNodeData {
  type: 'talkingHeadScript';
  durationSeconds: number;
  clipCount: number;
  wordsPerSecond: number;
  language: string;
  productContext: string | null;
  brandVoice: string | null;
  harnessContext: Record<string, unknown> | string | null;
  outputScript: TalkingHeadScript | null;
  outputSegments: TalkingHeadScriptSegment[];
  outputFullText: string | null;
}

export const DEFAULT_TALKING_HEAD_SCRIPT_DATA: Partial<TalkingHeadScriptNodeData> =
  {
    brandVoice: null,
    clipCount: 5,
    durationSeconds: 30,
    harnessContext: null,
    label: 'Talking-head Script',
    language: 'en',
    outputFullText: null,
    outputScript: null,
    outputSegments: [],
    productContext: null,
    status: 'idle',
    type: 'talkingHeadScript',
    wordsPerSecond: 3.5,
  };

export const talkingHeadScriptNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_TALKING_HEAD_SCRIPT_DATA,
  description:
    'Generate a duration-accurate talking-head script with hook-first, CTA-last clip segments',
  icon: 'FileText',
  inputs: [
    {
      id: 'productContext',
      label: 'Product Context',
      required: true,
      type: 'text',
    },
    {
      id: 'brandVoice',
      label: 'Brand Voice',
      required: false,
      type: 'text',
    },
    {
      id: 'harnessContext',
      label: 'Harness Context',
      required: false,
      type: 'object',
    },
    {
      id: 'durationSeconds',
      label: 'Duration (seconds)',
      required: false,
      type: 'number',
    },
    {
      id: 'clipCount',
      label: 'Clip Count',
      required: false,
      type: 'number',
    },
    {
      id: 'wordsPerSecond',
      label: 'Words per Second',
      required: false,
      type: 'number',
    },
    {
      id: 'language',
      label: 'Language',
      required: false,
      type: 'text',
    },
  ],
  label: 'Talking-head Script',
  outputs: [
    { id: 'script', label: 'Timed Script', type: 'object' },
    { id: 'segments', label: 'Segments', type: 'object' },
    { id: 'fullText', label: 'Full Script', type: 'text' },
    { id: 'clipCount', label: 'Clip Count', type: 'number' },
    {
      id: 'totalDurationSeconds',
      label: 'Total Duration (seconds)',
      type: 'number',
    },
    {
      id: 'totalTargetWordCount',
      label: 'Target Words',
      type: 'number',
    },
    { id: 'totalWordCount', label: 'Actual Words', type: 'number' },
    {
      id: 'wordsPerSecond',
      label: 'Words per Second',
      type: 'number',
    },
  ],
  type: 'talkingHeadScript',
};
