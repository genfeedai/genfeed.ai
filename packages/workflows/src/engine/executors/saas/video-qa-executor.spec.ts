import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import {
  buildVideoQaReport,
  createVideoQaExecutor,
  parseBlackDetectLog,
  parseEbur128IntegratedLoudness,
  parseFfprobeStreams,
  parseFreezeDetectLog,
} from './video-qa-executor';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

const HEALTHY_PROBE_JSON = JSON.stringify({
  format: { duration: '10.000000' },
  streams: [
    {
      avg_frame_rate: '30/1',
      codec_name: 'h264',
      codec_type: 'video',
      height: 1080,
      r_frame_rate: '30/1',
      width: 1920,
    },
    {
      channels: 2,
      codec_name: 'aac',
      codec_type: 'audio',
    },
  ],
});

const INJECTED_DETECT_LOG = `
[blackdetect @ 0x7f8] black_start:1.000000 black_end:2.500000 black_duration:1.500000
[freezedetect @ 0x7f9] lavfi.freezedetect.freeze_start: 4.000000
[freezedetect @ 0x7f9] lavfi.freezedetect.freeze_end: 6.250000
[freezedetect @ 0x7f9] lavfi.freezedetect.freeze_duration: 2.250000
`;

const OFF_TARGET_LOUDNESS_LOG = `
[Parsed_ebur128_0 @ 0x7fa] Summary:

  Integrated loudness:
    I:         -23.0 LUFS
    Threshold: -33.1 LUFS
`;

const ON_TARGET_LOUDNESS_LOG = `
[Parsed_ebur128_0 @ 0x7fa] Summary:

  Integrated loudness:
    I:         -16.1 LUFS
    Threshold: -26.2 LUFS
`;

describe('video-qa parsers', () => {
  it('parses blackdetect timestamps', () => {
    expect(parseBlackDetectLog(INJECTED_DETECT_LOG)).toEqual([
      { end: 2.5, start: 1 },
    ]);
  });

  it('parses freezedetect timestamps', () => {
    expect(parseFreezeDetectLog(INJECTED_DETECT_LOG)).toEqual([
      { end: 6.25, start: 4 },
    ]);
  });

  it('pairs freeze_start with duration when freeze_end is missing', () => {
    expect(
      parseFreezeDetectLog(
        '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 8.0\n',
        10,
      ),
    ).toEqual([{ end: 10, start: 8 }]);
  });

  it('parses ebur128 integrated loudness from the summary', () => {
    expect(parseEbur128IntegratedLoudness(OFF_TARGET_LOUDNESS_LOG)).toBe(-23);
    expect(parseEbur128IntegratedLoudness(ON_TARGET_LOUDNESS_LOG)).toBe(-16.1);
  });

  it('parses ffprobe streams, duration, and frame rate', () => {
    const parsed = parseFfprobeStreams(HEALTHY_PROBE_JSON);
    expect(parsed.durationSeconds).toBe(10);
    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
    expect(parsed.frameRate).toBe(30);
    expect(parsed.streams).toHaveLength(2);
  });
});

describe('buildVideoQaReport', () => {
  it('flags injected black frames, a freeze, and off-target loudness with timestamps', () => {
    const report = buildVideoQaReport({
      contract: {
        loudnessTargetLufs: -16,
        loudnessToleranceLufs: 2,
      },
      inspection: {
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: INJECTED_DETECT_LOG,
        loudnessLog: OFF_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.decodeOk).toBe(true);
    expect(report.blackSegments).toEqual([{ end: 2.5, start: 1 }]);
    expect(report.freezeSegments).toEqual([{ end: 6.25, start: 4 }]);
    expect(report.loudnessLufs).toBe(-23);
    expect(report.loudnessTargetLufs).toBe(-16);
    expect(report.loudnessDeviation).toBe(-7);
    expect(report.failures.map((failure) => failure.code)).toEqual([
      'BLACK_FRAMES',
      'FREEZE_FRAMES',
      'LOUDNESS_OFF_TARGET',
    ]);
    expect(report.failures.map((failure) => failure.timestamp)).toEqual([
      1,
      4,
      null,
    ]);
  });

  it('passes a healthy fixture with a populated conformance report', () => {
    const report = buildVideoQaReport({
      contract: {
        expectedDurationSeconds: 10,
        expectedFrameRate: 30,
        expectedHeight: 1080,
        expectedWidth: 1920,
        hasExpectedAudio: true,
        loudnessTargetLufs: -16,
        loudnessToleranceLufs: 2,
      },
      inspection: {
        contactSheetUrl: 'https://cdn.example/sheet.png',
        decodeOk: true,
        detectLog: '',
        loudnessLog: ON_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      },
    });

    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.durationSeconds).toBe(10);
    expect(report.width).toBe(1920);
    expect(report.height).toBe(1080);
    expect(report.frameRate).toBe(30);
    expect(report.streams).toHaveLength(2);
    expect(report.loudnessLufs).toBe(-16.1);
    expect(report.contactSheetUrl).toBe('https://cdn.example/sheet.png');
    expect(report.blackSegments).toEqual([]);
    expect(report.freezeSegments).toEqual([]);
  });

  it('fails closed on decode failure', () => {
    const report = buildVideoQaReport({
      contract: { loudnessTargetLufs: -16, loudnessToleranceLufs: 2 },
      inspection: {
        contactSheetUrl: null,
        decodeOk: false,
        detectLog: '',
        loudnessLog: null,
        probeJson: '{}',
      },
    });

    expect(report.passed).toBe(false);
    expect(report.decodeOk).toBe(false);
    expect(report.failures[0]?.code).toBe('DECODE_FAILED');
  });

  it('reports duration, resolution, frame-rate, and stream-layout contract misses', () => {
    const report = buildVideoQaReport({
      contract: {
        expectedDurationSeconds: 8,
        expectedFrameRate: 24,
        expectedHeight: 1920,
        expectedWidth: 1080,
        hasExpectedAudio: true,
        loudnessTargetLufs: -16,
        loudnessToleranceLufs: 2,
      },
      inspection: {
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: '',
        loudnessLog: null,
        probeJson: JSON.stringify({
          format: { duration: '4.000000' },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: 720,
              r_frame_rate: '30/1',
              width: 1280,
            },
          ],
        }),
      },
    });

    expect(report.passed).toBe(false);
    expect(report.failures.map((failure) => failure.code)).toEqual([
      'DURATION_MISMATCH',
      'RESOLUTION_MISMATCH',
      'FRAME_RATE_MISMATCH',
      'STREAM_LAYOUT_MISMATCH',
    ]);
  });

  it('skips loudness when the video has no audio', () => {
    const report = buildVideoQaReport({
      contract: { loudnessTargetLufs: -16, loudnessToleranceLufs: 2 },
      inspection: {
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: '',
        loudnessLog: null,
        probeJson: JSON.stringify({
          format: { duration: '2.0' },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: 720,
              r_frame_rate: '24/1',
              width: 1280,
            },
          ],
        }),
      },
    });

    expect(report.loudnessLufs).toBeNull();
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
  });
});

describe('VideoQaExecutor', () => {
  describe('validate', () => {
    it('accepts defaults', () => {
      expect(
        createVideoQaExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        }).valid,
      ).toBe(true);
    });

    it('rejects a non-numeric loudness target', () => {
      expect(
        createVideoQaExecutor().validate({
          config: { loudnessTargetLufs: 'hot' },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        }).valid,
      ).toBe(false);
    });

    it('rejects a negative freeze duration', () => {
      expect(
        createVideoQaExecutor().validate({
          config: { freezeDurationSeconds: -1 },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 1', () => {
    expect(
      createVideoQaExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'QA',
        type: 'videoQa',
      }),
    ).toBe(1);
  });

  describe('execute', () => {
    it('throws without a processor', async () => {
      await expect(
        createVideoQaExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'QA',
            type: 'videoQa',
          },
        }),
      ).rejects.toThrow('processor');
    });

    it('returns a structured failure instead of forwarding the video', async () => {
      const processor = vi.fn().mockResolvedValue({
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: INJECTED_DETECT_LOG,
        loudnessLog: OFF_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      });
      const result = await createVideoQaExecutor(processor).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        },
      });
      const data = result.data as {
        failures: Array<{ code: string; timestamp: number | null }>;
        passed: boolean;
        video: string | null;
      };

      expect(data.passed).toBe(false);
      expect(data.video).toBeNull();
      expect(data.failures.map((failure) => failure.code)).toEqual([
        'BLACK_FRAMES',
        'FREEZE_FRAMES',
        'LOUDNESS_OFF_TARGET',
      ]);
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({
          isContactSheetEnabled: false,
          videoUrl: 'http://in.mp4',
        }),
      );
    });

    it('forwards the video only when every check passes', async () => {
      const processor = vi.fn().mockResolvedValue({
        contactSheetUrl: 'https://cdn.example/sheet.png',
        decodeOk: true,
        detectLog: '',
        loudnessLog: ON_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      });
      const result = await createVideoQaExecutor(processor).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
        node: {
          config: { isContactSheetEnabled: true },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        },
      });
      const data = result.data as {
        contactSheetUrl: string | null;
        passed: boolean;
        video: string | null;
      };

      expect(data.passed).toBe(true);
      expect(data.video).toBe('http://in.mp4');
      expect(data.contactSheetUrl).toBe('https://cdn.example/sheet.png');
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({ isContactSheetEnabled: true }),
      );
    });

    it('does not request a contact sheet when the flag is off', async () => {
      const processor = vi.fn().mockResolvedValue({
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: '',
        loudnessLog: ON_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      });
      await createVideoQaExecutor(processor).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
        node: {
          config: { isContactSheetEnabled: false },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        },
      });
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({ isContactSheetEnabled: false }),
      );
    });

    it('records an observable continuity skip when no resolver is configured', async () => {
      const processor = vi.fn().mockResolvedValue({
        contactSheetUrl: 'https://cdn.example/sheet.png',
        decodeOk: true,
        detectLog: '',
        loudnessLog: ON_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      });
      const result = await createVideoQaExecutor(processor).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
        node: {
          config: {
            characterReferenceUrls: ['https://cdn.example/face.png'],
            isContinuityQaEnabled: true,
          },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        },
      });

      expect(result.data).toMatchObject({
        continuityQa: {
          skipReason: 'continuity_resolver_unavailable',
          status: 'skipped',
        },
        passed: true,
        video: 'http://in.mp4',
      });
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({ isContactSheetEnabled: true }),
      );
    });

    it('attaches structured continuity findings without changing deterministic pass-through', async () => {
      const processor = vi.fn().mockResolvedValue({
        contactSheetUrl: 'https://cdn.example/sheet.png',
        decodeOk: true,
        detectLog: '',
        loudnessLog: ON_TARGET_LOUDNESS_LOG,
        probeJson: HEALTHY_PROBE_JSON,
      });
      const resolver = vi.fn().mockResolvedValue({
        finding: {
          character: {
            confidence: 0.94,
            summary: 'Character changed.',
            verdict: 'drift',
          },
          clipId: 'workflow-video',
          clipIndex: 0,
          errors: [],
          evidenceFrames: [
            { kind: 'contact_sheet', url: 'https://cdn.example/sheet.png' },
          ],
          outfit: {
            confidence: 0.9,
            summary: 'Outfit changed.',
            verdict: 'drift',
          },
          product: {
            confidence: null,
            summary: 'No product.',
            verdict: 'not_assessed',
          },
          videoUrl: 'http://in.mp4',
        },
        modelKey: 'openai/gpt-4.1-mini',
      });
      const result = await createVideoQaExecutor(processor, resolver).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['video', 'http://in.mp4']]),
        node: {
          config: {
            characterReferenceUrls: ['https://cdn.example/face.png'],
            isContinuityQaEnabled: true,
          },
          id: '1',
          inputs: [],
          label: 'QA',
          type: 'videoQa',
        },
      });

      expect(result.data).toMatchObject({
        continuityQa: {
          modelKey: 'openai/gpt-4.1-mini',
          status: 'completed',
          summary: { driftClipCount: 1 },
        },
        passed: true,
        video: 'http://in.mp4',
      });
    });
  });
});
