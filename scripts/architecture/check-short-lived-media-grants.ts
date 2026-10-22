/**
 * Guard against short-lived media grants reaching a long-lived message (#4895).
 *
 * `AuthorizedMediaUrlService` grants expire in minutes (the signed URL TTL, or
 * five minutes for S3 execution grants). That suits a consumer that fetches the
 * URL when it is issued: a provider, the files app, a renderer, a publisher.
 * It does not suit a chat card, email or stored record that someone opens
 * later, because the link is dead by then. Discord loads embed images lazily,
 * so a generation card that linked a grant rendered as a broken image.
 *
 * Every file that issues a grant is listed here with the reason its consumer
 * is safe. A new caller, or a count that grows or shrinks, fails so each one is
 * reviewed. A grant that must outlive the request is copied into the message
 * (an attachment) instead of linked.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

export type ShortLivedMediaGrantAllowance = {
  count: number;
  file: string;
  reason: string;
};

export type ShortLivedMediaGrantViolation = {
  file: string;
  message: string;
};

export type ShortLivedMediaGrantOptions = {
  allowances?: readonly ShortLivedMediaGrantAllowance[];
  rootDir?: string;
};

const FETCHED_NOW =
  'The grant is handed to a provider, the files app or a renderer that fetches it for the same request; it is never stored or sent in a message.';

const DISCORD_CARD =
  'The grant goes into a Discord card, which copies the media at delivery (#7809) and never links the grant, a button or a log line.';
const POST_PROCESSING =
  "The grant goes to the bot reply and the thumbnailer. The Discord bot uploads the media with the reply; the other bot adapters fetch the URL when they post, except Slack's video link.";
const PUBLISHER =
  'Issued when the post publishes, for the platform upload that follows; it is not stored with the scheduled post.';
export const SHORT_LIVED_MEDIA_GRANT_ALLOWANCES: ShortLivedMediaGrantAllowance[] =
  [
    {
      count: 1,
      file: 'apps/server/api/src/collections/images/controllers/operations/images-operations.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/videos/controllers/captions/videos-captions.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/videos/controllers/transformations/edits/videos-edits.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/videos/controllers/transformations/effects/videos-effects.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/videos/controllers/transformations/gif/videos-gif.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/videos/controllers/transformations/resize/videos-resize.controller.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 2,
      file: 'apps/server/api/src/collections/videos/services/avatar-video-reference.service.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/collections/workflows/services/workflow-media-processing-executor-registrar.service.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 2,
      file: 'apps/server/api/src/collections/workflows/services/workflow-media-provider-plan.service.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 3,
      file: 'apps/server/api/src/endpoints/webhooks/services/post-processing-orchestrator.service.ts',
      reason: POST_PROCESSING,
    },
    {
      count: 1,
      file: 'apps/server/api/src/endpoints/webhooks/webhooks.service.ts',
      reason: DISCORD_CARD,
    },
    {
      count: 2,
      file: 'apps/server/api/src/helpers/utils/reference/reference.util.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/content-orchestration/step-executor.service.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/integrations/publishers/publisher-factory.service.ts',
      reason: PUBLISHER,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/integrations/youtube/services/modules/youtube-upload.service.ts',
      reason: PUBLISHER,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/media-perception/media-perception.service.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/media-urls/processing-media-url.util.ts',
      reason: FETCHED_NOW,
    },
    {
      count: 1,
      file: 'apps/server/api/src/services/whisper/whisper.service.ts',
      reason: FETCHED_NOW,
    },
  ];

const MATCH =
  /\.(?:issueServerPublish|issueExecutionUrls|issueServerAssetUrls)\(|\bauthorizeProcessingUrl\(/gu;

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function runCheckShortLivedMediaGrants(
  options: ShortLivedMediaGrantOptions = {},
): { scannedFileCount: number; violations: ShortLivedMediaGrantViolation[] } {
  const rootDir = options.rootDir ?? process.cwd();
  const allowances = options.allowances ?? SHORT_LIVED_MEDIA_GRANT_ALLOWANCES;
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

  const violations: ShortLivedMediaGrantViolation[] = [];
  for (const [file, count] of found) {
    const expected = allowed.get(file) ?? 0;
    if (count > expected) {
      violations.push({
        file,
        message:
          expected === 0
            ? `${count} new short-lived media grant call(s). List the file with the reason its consumer fetches the grant when issued; a chat card, email or stored record must copy the media instead of linking it.`
            : `${count} short-lived media grant call(s), ${expected} allowed. Confirm the new consumer fetches the grant when issued, then raise the allowance.`,
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
  const result = runCheckShortLivedMediaGrants();

  if (result.violations.length > 0) {
    console.error('Short-lived media grant guard violations found:');
    for (const violation of result.violations) {
      console.error(`- ${violation.file} — ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Short-lived media grant guard passed across ${result.scannedFileCount} server source file(s).`,
  );
}
