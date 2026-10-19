/**
 * Guard against new ID-derived media URLs on the server (#4895).
 *
 * `${ingredientsEndpoint}/<category>/<id>` names media by guessable id. With
 * authorized delivery on, the CDN rejects it, so anything a provider, the
 * files app or a person must fetch needs an issued grant instead
 * (`AuthorizedMediaUrlService`, `resolveIngredientProcessingUrl`,
 * `authorizeProviderInput`). Every remaining construction is listed here with
 * its reason, and a count that grows or shrinks fails so the list stays exact.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

export type IdDerivedMediaUrlAllowance = {
  count: number;
  file: string;
  reason: string;
};

export type IdDerivedMediaUrlViolation = {
  file: string;
  message: string;
};

export type IdDerivedMediaUrlOptions = {
  allowances?: readonly IdDerivedMediaUrlAllowance[];
  rootDir?: string;
};

const FLAG_OFF = 'Flag-off branch; authorized delivery issues a grant instead.';
const STABLE_INPUT =
  'Stable canonical input that is hashed or persisted; a grant is minted at the provider call (authorizeProviderInput).';
const RESPONSE_ONLY =
  'Response or stored value only; the media-delivery interceptor projects it before it leaves the API.';

export const ID_DERIVED_MEDIA_URL_ALLOWANCES: IdDerivedMediaUrlAllowance[] = [
  {
    count: 2,
    file: 'apps/server/api/src/collections/editor-projects/editor-projects.controller.ts',
    reason: `${RESPONSE_ONLY} Clips carry ingredientId, so the renderer never trusts this value.`,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/editor-projects/services/editor-render.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 2,
    file: 'apps/server/api/src/collections/images/controllers/operations/images-operations.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/ingredients/controllers/ingredients-operations.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 2,
    file: 'apps/server/api/src/collections/trainings/services/trainings.service.ts',
    reason:
      'Dataset download falls back to the id only when no stored source key exists; the archive URL is a flag-off branch.',
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/captions/videos-captions.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/transformations/edits/videos-edits.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/transformations/effects/videos-effects.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/transformations/gif/videos-gif.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/transformations/resize/videos-resize.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/controllers/videos.controller.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/videos/services/avatar-video-reference.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 2,
    file: 'apps/server/api/src/collections/videos/services/video-extension-execution.service.ts',
    reason: STABLE_INPUT,
  },
  {
    count: 3,
    file: 'apps/server/api/src/collections/workflows/services/workflow-engine-executor-helper.service.ts',
    reason: `${STABLE_INPUT} Reference builders resolve to canonical URLs on purpose.`,
  },
  {
    count: 1,
    file: 'apps/server/api/src/collections/workflows/services/workflow-media-processing-executor-registrar.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 3,
    file: 'apps/server/api/src/endpoints/analytics/analytics-response.projection.ts',
    reason: RESPONSE_ONLY,
  },
  {
    count: 1,
    file: 'apps/server/api/src/endpoints/dev/dev.controller.ts',
    reason: 'Development-only endpoint that is disabled in production.',
  },
  {
    count: 1,
    file: 'apps/server/api/src/endpoints/webhooks/services/post-processing-orchestrator.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 2,
    file: 'apps/server/api/src/endpoints/webhooks/webhooks.service.ts',
    reason: `${FLAG_OFF} The other is a log line.`,
  },
  {
    count: 2,
    file: 'apps/server/api/src/helpers/utils/reference/reference.util.ts',
    reason: FLAG_OFF,
  },
  {
    count: 2,
    file: 'apps/server/api/src/services/integrations/crun/crun-reference.util.ts',
    reason:
      'Crun quotes freeze and hash their input; authorized delivery fails closed before this point.',
  },
  {
    count: 1,
    file: 'apps/server/api/src/services/integrations/publishers/base-publisher.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/services/integrations/youtube/services/modules/youtube-upload.service.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/services/media-urls/processing-media-url.util.ts',
    reason: FLAG_OFF,
  },
  {
    count: 1,
    file: 'apps/server/api/src/services/whisper/whisper.service.ts',
    reason: 'Flag-off fallback; authorized delivery requires an issued grant.',
  },
  {
    count: 1,
    file: 'apps/server/workers/src/crons/ingredients/cron.ingredients.service.ts',
    reason:
      'Metadata refresh reads through the stored object key; the id-derived URL is only the fallback for media that predates stored keys.',
  },
  {
    count: 1,
    file: 'apps/server/files/src/processors/file.processor.ts',
    reason: 'Gated by the authorized-delivery flag.',
  },
  {
    count: 1,
    file: 'apps/server/files/src/services/files/files.service.ts',
    reason:
      'Legacy script-video builder (prepare-all-files); nothing in the API calls it. Delete with that path.',
  },
  {
    count: 1,
    file: 'apps/server/files/src/services/youtube/youtube.service.ts',
    reason: 'Gated by the authorized-delivery flag.',
  },
];

const MATCH = /\bingredientsEndpoint\}\/|\bcdnUrl\}\/ingredients\//gu;

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function runCheckIdDerivedMediaUrls(
  options: IdDerivedMediaUrlOptions = {},
): { scannedFileCount: number; violations: IdDerivedMediaUrlViolation[] } {
  const rootDir = options.rootDir ?? process.cwd();
  const allowances = options.allowances ?? ID_DERIVED_MEDIA_URL_ALLOWANCES;
  const allowed = new Map<string, number>();
  for (const entry of allowances) {
    const file = normalizePath(entry.file);
    allowed.set(file, (allowed.get(file) ?? 0) + entry.count);
  }
  const files = globSync('apps/server/*/src/**/*.ts', {
    absolute: true,
    cwd: rootDir,
    ignore: ['**/*.spec.*', '**/*.test.*', '**/node_modules/**', '**/dist/**'],
    nodir: true,
  }).sort();
  const found = new Map<string, number>();

  for (const filePath of files) {
    const count = [...readFileSync(filePath, 'utf8').matchAll(MATCH)].length;
    if (count > 0) {
      found.set(normalizePath(path.relative(rootDir, filePath)), count);
    }
  }

  const violations: IdDerivedMediaUrlViolation[] = [];
  for (const [file, count] of found) {
    const expected = allowed.get(file) ?? 0;
    if (count > expected) {
      violations.push({
        file,
        message:
          expected === 0
            ? `${count} new ID-derived media URL(s). Issue a grant (AuthorizedMediaUrlService / resolveIngredientProcessingUrl) instead.`
            : `${count} ID-derived media URL(s), ${expected} allowed. Issue a grant instead of adding another.`,
      });
    }
  }
  for (const [file, expected] of allowed) {
    const count = found.get(file) ?? 0;
    if (count < expected) {
      violations.push({
        file,
        message: `Allowance is stale (${expected} listed, ${count} found). Lower or remove it.`,
      });
    }
  }

  return { scannedFileCount: files.length, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckIdDerivedMediaUrls();

  if (result.violations.length > 0) {
    console.error('ID-derived media URL guard violations found:');
    for (const violation of result.violations) {
      console.error(`- ${violation.file} — ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `ID-derived media URL guard passed across ${result.scannedFileCount} server source file(s).`,
  );
}
