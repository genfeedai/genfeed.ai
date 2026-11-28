import {
  buildRepostVariantArgs,
  normalizeRepostVariantOptions,
} from '@files/services/ffmpeg/helpers/repost-variant-args.helper';

const base = { hasAudio: true, inputPath: '/in.mp4', outputPath: '/out.mp4' };

function filterOf(args: string[], flag: '-vf' | '-af'): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('buildRepostVariantArgs', () => {
  it('applies every picked change in one pass', () => {
    const args = buildRepostVariantArgs({
      ...base,
      isMirrored: true,
      speed: 1.1,
      trimStartSeconds: 2,
      zoom: 1.05,
    });

    expect(args.slice(0, 4)).toEqual(['-ss', '2', '-i', '/in.mp4']);
    expect(filterOf(args, '-vf')).toBe(
      'hflip,scale=trunc(iw*1.05/2)*2:trunc(ih*1.05/2)*2,crop=trunc(iw/1.05/2)*2:trunc(ih/1.05/2)*2,setpts=PTS/1.1',
    );
    expect(filterOf(args, '-af')).toBe('atempo=1.1');
    expect(args.at(-1)).toBe('/out.mp4');
  });

  it('leaves an unpicked change out of the filters', () => {
    const args = buildRepostVariantArgs({ ...base, isMirrored: true });

    expect(args).not.toContain('-ss');
    expect(filterOf(args, '-vf')).toBe('hflip');
    expect(filterOf(args, '-af')).toBeUndefined();
  });

  it('drops the audio filters for a video with no audio track', () => {
    const args = buildRepostVariantArgs({
      ...base,
      hasAudio: false,
      speed: 1.1,
    });

    expect(args).toContain('-an');
    expect(filterOf(args, '-af')).toBeUndefined();
    expect(args).not.toContain('aac');
  });
});

describe('normalizeRepostVariantOptions', () => {
  it('refuses a variant that changes nothing', () => {
    expect(() => normalizeRepostVariantOptions({})).toThrow(
      'Pick at least one change',
    );
  });

  it.each([
    [{ speed: 0.9 }, 'Speed must be'],
    [{ speed: 3 }, 'Speed must be'],
    [{ zoom: 2 }, 'Zoom must be'],
    [{ trimStartSeconds: -1 }, 'Cut the start'],
    [{ trimStartSeconds: 60 }, 'Cut the start'],
    [{ speed: Number.NaN }, 'Speed must be'],
  ])('refuses %j', (options, message) => {
    expect(() => normalizeRepostVariantOptions(options)).toThrow(message);
  });
});
