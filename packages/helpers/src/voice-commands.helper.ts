import { MODEL_KEYS } from '@genfeedai/constants';
import type { VoiceCommand } from '@hooks/media/use-voice-commands/use-voice-commands';

export const MODEL_VOICE_ALIASES: Record<string, string> = {
  banana: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
  'flux kontext': MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
  'flux kontext pro': MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
  'imagen 3': MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
  'imagen 4': MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
  kling: MODEL_KEYS.KLINGAI_V2,
  'kling ai': MODEL_KEYS.KLINGAI_V2,
  'kling v2': MODEL_KEYS.KLINGAI_V2,
  kontext: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
  leonardo: MODEL_KEYS.LEONARDOAI,
  leonardoai: MODEL_KEYS.LEONARDOAI,
  musicgen: MODEL_KEYS.REPLICATE_META_MUSICGEN,
  'nano banana': MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
  runway: MODEL_KEYS.RUNWAYML,
  runwayml: MODEL_KEYS.RUNWAYML,
  sdxl: MODEL_KEYS.SDXL,
  'see dream': MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
  'see dream 4': MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
  seedream: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
  'seedream 4': MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
  'sora 2': MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
  'sora 2 pro': MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
  'sora pro': MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
  'sora two': MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
  'veo 2': MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
  'veo 3': MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
  'veo 3 fast': MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
  'veo fast': MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
  'veo three': MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
};

export const FORMAT_VOICE_ALIASES: Record<string, string> = {
  '1 1': 'square',
  '1:1': 'square',
  '9 16': 'portrait',
  '9:16': 'portrait',
  '16 9': 'landscape',
  '16:9': 'landscape',
  horizontal: 'landscape',
  landscape: 'landscape',
  portrait: 'portrait',
  square: 'square',
  vertical: 'portrait',
};

export const DURATION_VOICE_ALIASES: Record<string, number> = {
  '5 seconds': 5,
  '10 seconds': 10,
  '15 seconds': 15,
  '20 seconds': 20,
  'fifteen seconds': 15,
  'five seconds': 5,
  'ten seconds': 10,
  'twenty seconds': 20,
};

export function createPromptBarVoiceCommands(
  setValue: (field: string, value: unknown) => void,
): VoiceCommand[] {
  return [
    // Model selection
    {
      action: (matches: RegExpMatchArray) => {
        const modelName = matches[1].trim().toLowerCase();
        const modelKey = MODEL_VOICE_ALIASES[modelName];
        if (modelKey) {
          setValue('model', modelKey);
        }
      },
      description: 'Change model to [model name]',
      pattern: /(?:change|set|use|switch to) (?:the )?model (?:to )?(.+)/i,
    },

    // Format selection
    {
      action: (matches: RegExpMatchArray) => {
        const formatName = matches[1].trim().toLowerCase();
        const format = FORMAT_VOICE_ALIASES[formatName];
        if (format) {
          setValue('format', format);
        }
      },
      description: 'Change format to [portrait|landscape|square]',
      pattern: /(?:change|set|use|switch to) (?:the )?format (?:to )?(.+)/i,
    },
    {
      action: (matches: RegExpMatchArray) => {
        const formatName = matches[1].trim().toLowerCase();
        const format = FORMAT_VOICE_ALIASES[formatName];
        if (format) {
          setValue('format', format);
        }
      },
      description: 'Make it [portrait|landscape|square]',
      pattern: /(?:make it|change to|set to) (portrait|landscape|square)/i,
    },

    // Duration selection
    {
      action: (matches: RegExpMatchArray) => {
        const duration = parseInt(matches[1], 10);
        if (!Number.isNaN(duration)) {
          setValue('duration', duration);
        }
      },
      description: 'Change duration to [number] seconds',
      pattern:
        /(?:change|set|make it) (?:the )?duration (?:to )?(\d+) seconds?/i,
    },
    {
      action: (matches: RegExpMatchArray) => {
        const durationStr = matches[1].trim().toLowerCase();
        const duration =
          DURATION_VOICE_ALIASES[`${durationStr} seconds`] ||
          parseInt(durationStr, 10);
        if (!Number.isNaN(duration)) {
          setValue('duration', duration);
        }
      },
      description: 'Make it [number] seconds',
      pattern:
        /(?:make it|set to) (five|ten|fifteen|twenty|\d+) seconds? (?:long)?/i,
    },

    // Clear/reset commands
    {
      action: () => {
        setValue('text', '');
      },
      description: 'Clear the prompt',
      pattern: /(?:clear|reset|remove) (?:the )?prompt/i,
    },
    {
      action: () => {
        setValue('references', []);
      },
      description: 'Clear the reference',
      pattern: /(?:clear|remove) (?:the )?reference/i,
    },

    // Style/mood/camera shortcuts
    {
      action: (matches: RegExpMatchArray) => {
        const style = matches[1].trim().toLowerCase().replace(/\s+/g, '-');
        setValue('style', style);
      },
      description: 'Add style [style name]',
      pattern: /(?:add|set|use) (?:the )?style (.+)/i,
    },
    {
      action: (matches: RegExpMatchArray) => {
        const mood = matches[1].trim().toLowerCase().replace(/\s+/g, '-');
        setValue('mood', mood);
      },
      description: 'Add mood [mood name]',
      pattern: /(?:add|set|use) (?:the )?mood (.+)/i,
    },
    {
      action: (matches: RegExpMatchArray) => {
        const camera = matches[1].trim().toLowerCase().replace(/\s+/g, '-');
        setValue('camera', camera);
      },
      description: 'Add camera [camera type]',
      pattern: /(?:add|set|use) (?:the )?camera (.+)/i,
    },
  ];
}

function getCategoryForDescription(desc: string): string | null {
  const lowerDesc = desc.toLowerCase();

  if (lowerDesc.includes('prompt')) {
    return 'Prompt';
  }
  if (lowerDesc.includes('model')) {
    return 'Model';
  }
  if (lowerDesc.includes('format')) {
    return 'Format';
  }
  if (lowerDesc.includes('duration')) {
    return 'Duration';
  }
  if (
    lowerDesc.includes('style') ||
    lowerDesc.includes('mood') ||
    lowerDesc.includes('camera')
  ) {
    return 'Style/Mood/Camera';
  }

  return null;
}

export function getVoiceCommandHelp(): string[] {
  const commands = createPromptBarVoiceCommands(() => {});
  const help: string[] = ['Voice Commands Available:'];

  const categories: Record<string, string[]> = {
    Duration: [],
    Format: [],
    Model: [],
    Prompt: [],
    'Style/Mood/Camera': [],
  };

  for (const command of commands) {
    const category = getCategoryForDescription(command.description);
    if (category) {
      categories[category].push(`• ${command.description}`);
    }
  }

  for (const [category, items] of Object.entries(categories)) {
    if (items.length > 0) {
      help.push(`${category}:`);
      help.push(...items);
    }
  }

  return help;
}
