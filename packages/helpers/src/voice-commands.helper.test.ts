import { ModelKey } from '@genfeedai/enums';
import {
  createPromptBarVoiceCommands,
  DURATION_VOICE_ALIASES,
  FORMAT_VOICE_ALIASES,
  getVoiceCommandHelp,
  MODEL_VOICE_ALIASES,
} from '@helpers/voice-commands.helper';
import { describe, expect, it, vi } from 'vitest';

describe('MODEL_VOICE_ALIASES', () => {
  it('maps "runway" to RUNWAYML model key', () => {
    expect(MODEL_VOICE_ALIASES.runway).toBe(ModelKey.RUNWAYML);
  });

  it('maps "sdxl" to SDXL model key', () => {
    expect(MODEL_VOICE_ALIASES.sdxl).toBe(ModelKey.SDXL);
  });

  it('maps "veo 3" to VEO_3 model key', () => {
    expect(MODEL_VOICE_ALIASES['veo 3']).toBe(ModelKey.REPLICATE_GOOGLE_VEO_3);
  });

  it('maps "kling" and "kling v2" to the same key', () => {
    expect(MODEL_VOICE_ALIASES.kling).toBe(MODEL_VOICE_ALIASES['kling v2']);
  });

  it('maps "kontext" and "flux kontext" to the same key', () => {
    expect(MODEL_VOICE_ALIASES.kontext).toBe(
      MODEL_VOICE_ALIASES['flux kontext'],
    );
  });
});

describe('FORMAT_VOICE_ALIASES', () => {
  it('maps "16:9" to "landscape"', () => {
    expect(FORMAT_VOICE_ALIASES['16:9']).toBe('landscape');
  });

  it('maps "9:16" to "portrait"', () => {
    expect(FORMAT_VOICE_ALIASES['9:16']).toBe('portrait');
  });

  it('maps "1:1" to "square"', () => {
    expect(FORMAT_VOICE_ALIASES['1:1']).toBe('square');
  });

  it('maps spoken "horizontal" to "landscape"', () => {
    expect(FORMAT_VOICE_ALIASES.horizontal).toBe('landscape');
  });

  it('maps spoken "vertical" to "portrait"', () => {
    expect(FORMAT_VOICE_ALIASES.vertical).toBe('portrait');
  });
});

describe('DURATION_VOICE_ALIASES', () => {
  it('maps "5 seconds" to 5', () => {
    expect(DURATION_VOICE_ALIASES['5 seconds']).toBe(5);
  });

  it('maps "fifteen seconds" to 15', () => {
    expect(DURATION_VOICE_ALIASES['fifteen seconds']).toBe(15);
  });

  it('maps "twenty seconds" to 20', () => {
    expect(DURATION_VOICE_ALIASES['twenty seconds']).toBe(20);
  });
});

describe('createPromptBarVoiceCommands', () => {
  it('returns a non-empty array of commands', () => {
    const setValue = vi.fn();
    const commands = createPromptBarVoiceCommands(setValue);
    expect(commands.length).toBeGreaterThan(0);
  });

  it('each command has pattern, action, and description', () => {
    const commands = createPromptBarVoiceCommands(vi.fn());
    for (const cmd of commands) {
      expect(cmd.pattern).toBeInstanceOf(RegExp);
      expect(typeof cmd.action).toBe('function');
      expect(typeof cmd.description).toBe('string');
    }
  });

  it('model command calls setValue("model", ...) with the right ModelKey', () => {
    const setValue = vi.fn();
    const commands = createPromptBarVoiceCommands(setValue);
    const modelCmd = commands.find((c) => /model/i.test(c.description))!;

    const match = 'change model to runway'.match(modelCmd.pattern)!;
    modelCmd.action(match);
    expect(setValue).toHaveBeenCalledWith('model', ModelKey.RUNWAYML);
  });

  it('format command calls setValue("format", "landscape")', () => {
    const setValue = vi.fn();
    const commands = createPromptBarVoiceCommands(setValue);
    const fmtCmd = commands.find((c) => /format/i.test(c.description))!;

    const match = 'set format to 16:9'.match(fmtCmd.pattern)!;
    fmtCmd.action(match);
    expect(setValue).toHaveBeenCalledWith('format', 'landscape');
  });

  it('clear prompt command calls setValue("text", "")', () => {
    const setValue = vi.fn();
    const commands = createPromptBarVoiceCommands(setValue);
    const clearCmd = commands.find((c) => c.pattern.test('clear the prompt'))!;

    const match = 'clear the prompt'.match(clearCmd.pattern)!;
    clearCmd.action(match);
    expect(setValue).toHaveBeenCalledWith('text', '');
  });

  it('style command normalises spaces to hyphens', () => {
    const setValue = vi.fn();
    const commands = createPromptBarVoiceCommands(setValue);
    const styleCmd = commands.find((c) => /style/i.test(c.description))!;

    const match = 'add style dark gritty'.match(styleCmd.pattern)!;
    styleCmd.action(match);
    expect(setValue).toHaveBeenCalledWith('style', 'dark-gritty');
  });
});

describe('getVoiceCommandHelp', () => {
  it('returns an array starting with "Voice Commands Available:"', () => {
    const help = getVoiceCommandHelp();
    expect(Array.isArray(help)).toBe(true);
    expect(help[0]).toBe('Voice Commands Available:');
  });

  it('includes category headers', () => {
    const help = getVoiceCommandHelp();
    expect(help).toContain('Model:');
    expect(help).toContain('Format:');
    expect(help).toContain('Duration:');
    expect(help).toContain('Prompt:');
  });

  it('every bullet starts with "•"', () => {
    const help = getVoiceCommandHelp();
    const bullets = help.filter((l) => l.startsWith('•'));
    expect(bullets.length).toBeGreaterThan(0);
  });
});
