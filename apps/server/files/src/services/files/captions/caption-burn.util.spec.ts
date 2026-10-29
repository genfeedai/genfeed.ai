import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCaptionBurnFilterScript,
  groupCaptionCues,
  parseSrtCues,
  resolveCaptionBurnStyle,
} from '@files/services/files/captions/caption-burn.util';
import { afterAll, describe, expect, it } from 'vitest';

const SRT = [
  '1',
  '00:00:00,500 --> 00:00:02,500',
  "I did one prompt to audit my codebase. It's 10:30, 100% done.",
  '',
  '2',
  '00:00:02,600 --> 00:00:04,000',
  'And he took your money.',
  '',
].join('\n');

describe('caption-burn.util', () => {
  describe('parseSrtCues', () => {
    it('reads index, times and text, and drops empty or reversed cues', () => {
      const cues = parseSrtCues(
        `${SRT}\n3\n00:00:09,000 --> 00:00:08,000\nbackwards\n\n4\n00:00:10,000 --> 00:00:11,000\n<i>  </i>\n`,
      );
      expect(cues).toEqual([
        {
          endMs: 2500,
          startMs: 500,
          text: "I did one prompt to audit my codebase. It's 10:30, 100% done.",
        },
        { endMs: 4000, startMs: 2600, text: 'And he took your money.' },
      ]);
    });
  });

  describe('resolveCaptionBurnStyle', () => {
    it('keeps valid values and replaces invalid ones with defaults', () => {
      const style = resolveCaptionBurnStyle({
        backgroundColor: 'red',
        fontColor: '#abcdef',
        fontSizeRatio: 9,
        maxLines: 7,
        position: 'sideways' as never,
      });
      expect(style.backgroundColor).toBeNull();
      expect(style.fontColor).toBe('#abcdef');
      expect(style.fontSizeRatio).toBe(0.12);
      expect(style.maxLines).toBe(3);
      expect(style.position).toBe('bottom');
    });
  });

  describe('groupCaptionCues', () => {
    const style = resolveCaptionBurnStyle({ maxLines: 2, maxWordsPerGroup: 6 });

    it('splits a long cue into groups of at most the word limit', () => {
      const groups = groupCaptionCues(parseSrtCues(SRT), style, 24);
      const words = groups.map(
        (group) => group.lines.join(' ').split(' ').length,
      );
      expect(Math.max(...words)).toBeLessThanOrEqual(6);
      expect(groups[0].startMs).toBe(500);
      expect(groups.at(-1)?.endMs).toBe(4000);
    });

    it('never lets a group run into the next and never exceeds maxLines', () => {
      const groups = groupCaptionCues(parseSrtCues(SRT), style, 12);
      for (const [index, group] of groups.entries()) {
        expect(group.lines.length).toBeLessThanOrEqual(2);
        if (index < groups.length - 1) {
          expect(group.endMs).toBeLessThanOrEqual(groups[index + 1].startMs);
        }
      }
    });
  });

  describe('buildCaptionBurnFilterScript', () => {
    it('returns null for an SRT with no usable cue', () => {
      expect(
        buildCaptionBurnFilterScript({ height: 1920, srt: '', width: 1080 }),
      ).toBeNull();
    });

    it('places a bottom block above the anchor and draws a band when asked', () => {
      const result = buildCaptionBurnFilterScript({
        height: 1920,
        srt: SRT,
        style: {
          backgroundColor: '#0D0D0D',
          bottomAnchorRatio: 0.78,
          fontSizeRatio: 0.0574,
        },
        width: 1080,
      });
      expect(result?.fontSize).toBe(62);
      expect(result?.script.startsWith('[0:v]drawbox=')).toBe(true);
      expect(result?.script.endsWith('[vFinal]')).toBe(true);
      expect(result?.script).toContain('color=0x0D0D0D@0.96');
      // two lines: 62 + 86 = 148 text + 2 * 26 padding = 200 high, bottom 1498
      expect(result?.script).toContain('y=1298:w=iw:h=200');
    });

    it('uses an outline instead of a band when there is no backing', () => {
      const result = buildCaptionBurnFilterScript({
        height: 1080,
        srt: SRT,
        width: 1920,
      });
      expect(result?.script).not.toContain('drawbox');
      expect(result?.script).toContain('borderw=');
    });
  });
});

const hasDrawtext = ((): boolean => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-filters'], {
    encoding: 'utf8',
  });
  return (
    result.status === 0 &&
    result.stdout.includes('drawtext') &&
    result.stdout.includes('drawbox')
  );
})();

describe.skipIf(!hasDrawtext)('burn-in render (real ffmpeg)', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-burn-'));
  afterAll(() => fs.rmSync(directory, { force: true, recursive: true }));

  it('draws visible captions only while they are spoken', () => {
    const script = buildCaptionBurnFilterScript({
      height: 640,
      srt: SRT,
      style: { backgroundColor: '#0D0D0D', fontColor: '#FFFFFF' },
      width: 360,
    });
    expect(script).not.toBeNull();
    const scriptPath = path.join(directory, 'captions.filter');
    const input = path.join(directory, 'input.mp4');
    const output = path.join(directory, 'output.mp4');
    fs.writeFileSync(scriptPath, script?.script ?? '');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x6688AA:s=360x640:d=5:r=10',
      '-pix_fmt',
      'yuv420p',
      '-y',
      input,
    ]);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      input,
      '-filter_complex_script',
      scriptPath,
      '-map',
      '[vFinal]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-y',
      output,
    ]);

    const darkPixelShare = (second: number): number => {
      const raw = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        String(second),
        '-i',
        output,
        '-frames:v',
        '1',
        '-vf',
        'crop=360:130:0:430,format=gray',
        '-f',
        'rawvideo',
        '-',
      ]);
      let dark = 0;
      for (const value of raw) if (value < 40) dark += 1;
      return dark / raw.length;
    };

    // The band (#0D0D0D) fills the crop while a caption is up, and is gone after.
    expect(darkPixelShare(1)).toBeGreaterThan(0.15);
    expect(darkPixelShare(4.5)).toBeLessThan(0.02);
  });
});
