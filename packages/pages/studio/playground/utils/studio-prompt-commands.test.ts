import type { StudioSystemPreset } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import { buildStudioPresetCommands } from '@pages/studio/playground/utils/studio-prompt-commands';
import { describe, expect, it } from 'vitest';

const LABELS = { presets: 'Presets', savedLooks: 'Saved looks' };

const banner = {
  description: 'A wide composition with space for your headline.',
  key: 'studio-banner',
  label: 'Banner',
  prompt: 'Create a banner.',
  type: 'image',
  values: { aspectRatio: '16:9' },
} as StudioSystemPreset;

function look(id: string, label: string): IStudioLook {
  return {
    aspectRatio: '4:5',
    camera: '',
    id,
    label,
    lens: '',
    lighting: 'soft 3200K',
    mood: '',
    promptTemplate: '',
    scene: '',
    style: 'warm linen',
  } as IStudioLook;
}

describe('buildStudioPresetCommands', () => {
  it('lists presets before saved looks, each under its own heading', () => {
    const { commands } = buildStudioPresetCommands(
      [banner],
      [look('l1', 'Warm linen')],
      LABELS,
    );

    expect(commands).toEqual([
      expect.objectContaining({
        group: 'Presets',
        kind: 'preset',
        label: 'Banner',
        name: 'banner',
      }),
      expect.objectContaining({
        description: 'warm linen · soft 3200K · 4:5',
        group: 'Saved looks',
        iconKey: 'look',
        name: 'warm-linen',
      }),
    ]);
  });

  it('keeps typed names unique and maps each back to what it applies', () => {
    const first = look('l1', 'Banner');
    const second = look('l2', '!!!');
    const { commands, targets } = buildStudioPresetCommands(
      [banner],
      [first, second],
      LABELS,
    );

    expect(commands.map((command) => command.name)).toEqual([
      'banner',
      'banner-2',
      'look-l2',
    ]);
    expect(targets.get('banner')?.systemPreset).toBe(banner);
    expect(targets.get('banner-2')?.look).toBe(first);
    expect(targets.get('look-l2')?.look).toBe(second);
  });
});
