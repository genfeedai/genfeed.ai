import type { NodeType } from '@genfeedai/types';
import Fuse from 'fuse.js';
import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Image,
  LayoutTemplate,
  MessageSquare,
  Mic,
  Play,
  PlayCircle,
  Plus,
  Save,
  Settings,
  Sparkles,
  Square,
  Type,
  Video,
  Wand2,
} from 'lucide-react';

export type CommandCategory = 'actions' | 'nodes' | 'navigation' | 'recent';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  shortcut?: string;
  icon: LucideIcon;
  keywords?: string[];
  nodeType?: NodeType;
}

export const COMMANDS: Command[] = [
  // Actions
  {
    category: 'actions',
    icon: Play,
    id: 'run-workflow',
    keywords: ['execute', 'start', 'run'],
    label: 'Run Workflow',
    shortcut: '⌘+Enter',
  },
  {
    category: 'actions',
    icon: PlayCircle,
    id: 'run-selected',
    keywords: ['execute', 'partial', 'selection'],
    label: 'Run Selected Nodes',
    shortcut: '⌘+Shift+Enter',
  },
  {
    category: 'actions',
    icon: Square,
    id: 'stop-execution',
    keywords: ['stop', 'cancel', 'halt'],
    label: 'Stop Execution',
  },
  {
    category: 'actions',
    icon: Save,
    id: 'save-workflow',
    keywords: ['export', 'download'],
    label: 'Save Workflow',
    shortcut: '⌘+S',
  },

  // Node shortcuts - AI
  {
    category: 'nodes',
    icon: Image,
    id: 'add-image-gen',
    keywords: ['flux', 'stable diffusion', 'generate', 'create'],
    label: 'Add Image Generator',
    nodeType: 'imageGen',
    shortcut: 'Shift+I',
  },
  {
    category: 'nodes',
    icon: Video,
    id: 'add-video-gen',
    keywords: ['video', 'generate', 'create', 'kling', 'runway'],
    label: 'Add Video Generator',
    nodeType: 'videoGen',
    shortcut: 'Shift+V',
  },
  {
    category: 'nodes',
    icon: FileText,
    id: 'add-prompt',
    keywords: ['text', 'input', 'prompt'],
    label: 'Add Prompt',
    nodeType: 'prompt',
    shortcut: 'Shift+P',
  },
  {
    category: 'nodes',
    icon: MessageSquare,
    id: 'add-llm',
    keywords: ['ai', 'chat', 'gpt', 'claude', 'language'],
    label: 'Add LLM',
    nodeType: 'llm',
    shortcut: 'Shift+L',
  },
  {
    category: 'nodes',
    icon: Mic,
    id: 'add-text-to-speech',
    keywords: ['tts', 'voice', 'audio', 'speak'],
    label: 'Add Text to Speech',
    nodeType: 'textToSpeech',
  },
  {
    category: 'nodes',
    icon: Type,
    id: 'add-transcribe',
    keywords: ['whisper', 'speech to text', 'stt', 'audio'],
    label: 'Add Transcribe',
    nodeType: 'transcribe',
  },

  // Navigation
  {
    category: 'navigation',
    icon: Settings,
    id: 'open-settings',
    keywords: ['preferences', 'config', 'options'],
    label: 'Open Settings',
    shortcut: '⌘+,',
  },
  {
    category: 'navigation',
    icon: LayoutTemplate,
    id: 'open-templates',
    keywords: ['starter', 'presets', 'workflows'],
    label: 'Browse Templates',
  },
  {
    category: 'navigation',
    icon: Sparkles,
    id: 'toggle-ai-generator',
    keywords: ['generate', 'create', 'ai'],
    label: 'AI Workflow Generator',
  },
  {
    category: 'navigation',
    icon: Plus,
    id: 'new-workflow',
    keywords: ['create', 'fresh', 'blank'],
    label: 'New Workflow',
  },
  {
    category: 'navigation',
    icon: Wand2,
    id: 'toggle-palette',
    keywords: ['search', 'commands'],
    label: 'Toggle Command Palette',
    shortcut: '⌘+K',
  },
];

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  actions: 'Actions',
  navigation: 'Navigation',
  nodes: 'Add Nodes',
  recent: 'Recent',
};

export const CATEGORY_ORDER: CommandCategory[] = ['recent', 'actions', 'nodes', 'navigation'];

// Fuse.js instance for fuzzy search (lazy-initialized)
let fuseInstance: Fuse<Command> | null = null;
let fuseCommands: Command[] | null = null;

function getFuse(commands: Command[]): Fuse<Command> {
  if (fuseInstance && fuseCommands === commands) return fuseInstance;
  fuseInstance = new Fuse(commands, {
    ignoreLocation: true,
    includeScore: true,
    keys: [
      { name: 'label', weight: 2 },
      { name: 'keywords', weight: 1 },
    ],
    minMatchCharLength: 1,
    threshold: 0.4,
  });
  fuseCommands = commands;
  return fuseInstance;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;

  const fuse = getFuse(commands);
  return fuse.search(query).map((result) => result.item);
}

export function groupCommandsByCategory(
  commands: Command[],
  recentIds: string[]
): Map<CommandCategory, Command[]> {
  const groups = new Map<CommandCategory, Command[]>();

  // Add recent commands first if any match
  if (recentIds.length > 0) {
    const recentCommands = recentIds
      .map((id) => commands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is Command => cmd !== undefined);

    if (recentCommands.length > 0) {
      groups.set('recent', recentCommands);
    }
  }

  // Group remaining commands by category
  for (const category of CATEGORY_ORDER) {
    if (category === 'recent') continue;

    const categoryCommands = commands.filter((cmd) => cmd.category === category);
    if (categoryCommands.length > 0) {
      groups.set(category, categoryCommands);
    }
  }

  return groups;
}
