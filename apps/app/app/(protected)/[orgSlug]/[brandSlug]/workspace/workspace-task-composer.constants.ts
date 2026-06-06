export type WorkspaceTaskMode = 'standard' | 'research' | 'trends';

export const TASK_PRESETS = [
  {
    label: 'Post',
    outputType: 'post' as const,
  },
  {
    label: 'Newsletter',
    outputType: 'newsletter' as const,
  },
  {
    label: 'Image',
    outputType: 'image' as const,
  },
  {
    label: 'Video',
    outputType: 'video' as const,
  },
  {
    label: 'Facecam',
    outputType: 'facecam' as const,
  },
  {
    label: 'Caption',
    outputType: 'caption' as const,
  },
  {
    label: 'Auto',
    outputType: 'ingredient' as const,
  },
];

export const TASK_MODE_OPTIONS: Array<{
  description: string;
  id: WorkspaceTaskMode;
  label: string;
}> = [
  {
    description: 'Create the requested output directly.',
    id: 'standard',
    label: 'Standard',
  },
  {
    description:
      'Route the task as a research brief with findings and next steps.',
    id: 'research',
    label: 'Research',
  },
  {
    description:
      'Produce a trend-focused report with signals, angles, and recommendations.',
    id: 'trends',
    label: 'Trends',
  },
];
