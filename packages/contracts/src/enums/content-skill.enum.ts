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
