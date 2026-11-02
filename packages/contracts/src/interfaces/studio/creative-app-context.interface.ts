/** The creative apps that keep their work in a brand's list of projects. */
export const CREATIVE_APP_IDS = [
  'clipper',
  'editor',
  'motion',
  'playground',
  'storyboard',
  'turbo',
] as const;

export type CreativeAppId = (typeof CREATIVE_APP_IDS)[number];

/** A project the viewer can see in a creative app's list. */
export interface CreativeAppProjectReference {
  readonly id: string;
  readonly title: string;
}

/**
 * What the agent needs to know about a creative app page: which app it is on,
 * whether a project is open, and the brand's projects. Sent as untrusted page
 * context: it grants no scope, so the agent resolves a project it acts on
 * through its own tools.
 */
export interface CreativeAppAgentContext {
  readonly app: CreativeAppId;
  /** The project the page has open; absent on the app's New screen. */
  readonly openProjectId?: string;
  readonly projects: readonly CreativeAppProjectReference[];
}
