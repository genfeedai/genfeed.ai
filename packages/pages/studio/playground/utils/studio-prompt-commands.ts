import type { StudioSystemPreset } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import type {
  StudioPresetCommandLabels,
  StudioPresetCommands,
  StudioPresetCommandTarget,
} from '@genfeedai/props/studio/studio-playground.props';

function toCommandName(label: string, fallback: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function describeLook(look: IStudioLook): string {
  return [look.style, look.mood, look.lighting, look.aspectRatio]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' · ');
}

/**
 * The `/` menu entries for one Studio type: built-in presets first, then the
 * operator's saved looks. Names are what the operator types after `/`, so
 * they come from labels and stay unique within the menu.
 */
export function buildStudioPresetCommands(
  systemPresets: readonly StudioSystemPreset[],
  looks: readonly IStudioLook[],
  labels: StudioPresetCommandLabels,
): StudioPresetCommands {
  const commands: PromptCommand[] = [];
  const targets = new Map<string, StudioPresetCommandTarget>();
  const claim = (base: string): string => {
    let name = base;
    for (let suffix = 2; targets.has(name); suffix += 1) {
      name = `${base}-${suffix}`;
    }
    return name;
  };

  for (const preset of systemPresets) {
    const name = claim(toCommandName(preset.label, preset.key));
    targets.set(name, { systemPreset: preset });
    commands.push({
      description: preset.description,
      group: labels.presets,
      iconKey: preset.type,
      kind: 'preset',
      label: preset.label,
      name,
    });
  }

  for (const look of looks) {
    const name = claim(toCommandName(look.label, `look-${look.id}`));
    targets.set(name, { look });
    commands.push({
      description: describeLook(look) || look.label,
      group: labels.savedLooks,
      iconKey: 'look',
      kind: 'preset',
      label: look.label,
      name,
    });
  }

  return { commands, targets };
}
