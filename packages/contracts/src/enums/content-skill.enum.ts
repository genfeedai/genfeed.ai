export enum ContentSkillCategory {
  WRITING = 'writing',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DISCOVERY = 'discovery',
  DISTRIBUTION = 'distribution',
  ANALYTICS = 'analytics',
  OPTIMIZATION = 'optimization',
}

export enum ContentRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ContentRunSource {
  BYOK = 'byok',
  HOSTED = 'hosted',
  MANAGED = 'managed',
}

/**
 * Composer surface a skill can be offered on via the `/` command palette.
 *
 * A skill is not owned by one surface: `resolveSkillSurfaces` derives the set
 * from the persisted taxonomy so custom and imported skills participate too.
 */
export enum SkillSurface {
  AGENT = 'agent',
  STUDIO = 'studio',
}

/**
 * Where a skill executes. A web skill runs in the Agent, on web and in Desktop.
 * A desktop skill needs tools a browser tab cannot reach (Chrome, ffmpeg), so it
 * runs in a Claude Code session in the Desktop terminal.
 */
export enum SkillRunsOn {
  DESKTOP = 'desktop',
  WEB = 'web',
}
