const ENV_FILE_PATTERN = /(^|\/)\.env(\..*)?$/;
const ENV_TEMPLATE_SUFFIX = '.env.example';
const ENV_TEMPLATE_KEY_PATTERN = /^#?\s*([A-Z][A-Z0-9_]*)=/;

/**
 * Per-service listen ports that Portless assigns at dev time
 * (`scripts/dev/portless-env.ts`). They are canonical spec keys but are not
 * meant to be set by hand, so the template does not have to list them.
 */
export const PORTLESS_MANAGED_PORT_KEYS: readonly string[] = [
  'API_PORT',
  'APP_PORT',
  'DOCS_PORT',
  'FILES_PORT',
  'MCP_PORT',
  'NOTIFICATIONS_PORT',
  'WEBSITE_PORT',
];

export interface EnvTemplateDriftInput {
  /** Keys the repo-root `.env.example` documents, commented-out ones included. */
  templateKeys: ReadonlySet<string>;
  /** Canonical keys listed in `ROOT_ENV_SECTIONS`. */
  canonicalKeys: ReadonlySet<string>;
  /** Keys every `ENV_TARGETS` entry reads or maps. */
  targetKeys: ReadonlySet<string>;
  /** Canonical keys the template may leave out. */
  exemptKeys?: readonly string[];
}

export interface EnvTemplateDrift {
  /** Canonical keys the template does not document. */
  missingFromTemplate: string[];
  /** Template keys that `ROOT_ENV_SECTIONS` does not know, so `env:sync` cannot place them. */
  unknownToSpec: string[];
  /** Target keys that `ROOT_ENV_SECTIONS` does not list, so `env:sync` cannot order them. */
  targetKeysOutsideSections: string[];
}

/** A real env file (`.env`, `.env.local`, `apps/x/.env.production`, ...) that must never be committed. */
export function isForbiddenEnvFile(filePath: string): boolean {
  return (
    ENV_FILE_PATTERN.test(filePath) && !filePath.endsWith(ENV_TEMPLATE_SUFFIX)
  );
}

export function isEnvTemplate(filePath: string): boolean {
  return filePath.endsWith(ENV_TEMPLATE_SUFFIX);
}

export function parseTemplateKeys(content: string): Set<string> {
  const keys = new Set<string>();

  for (const line of content.split('\n')) {
    const match = ENV_TEMPLATE_KEY_PATTERN.exec(line);

    if (match) {
      keys.add(match[1]);
    }
  }

  return keys;
}

export function findEnvTemplateDrift({
  templateKeys,
  canonicalKeys,
  targetKeys,
  exemptKeys = PORTLESS_MANAGED_PORT_KEYS,
}: EnvTemplateDriftInput): EnvTemplateDrift {
  const exempt = new Set(exemptKeys);

  return {
    missingFromTemplate: [...canonicalKeys]
      .filter((key) => !templateKeys.has(key) && !exempt.has(key))
      .sort(),
    targetKeysOutsideSections: [...targetKeys]
      .filter((key) => !canonicalKeys.has(key))
      .sort(),
    unknownToSpec: [...templateKeys]
      .filter((key) => !canonicalKeys.has(key))
      .sort(),
  };
}
