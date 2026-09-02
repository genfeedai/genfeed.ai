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
