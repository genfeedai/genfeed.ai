import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream, constants as fsConstants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  statfs,
} from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export const RAW_LIMIT = 50 * 1024 * 1024;
export const ENVELOPE_LIMIT = 100 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const GROUPS = [
  'dataset-diagnostic',
  'dataset-smoke',
  'dataset-scale',
  'final',
  'visual-isolation',
  'visual-connected',
  'agent-production',
  'brand-acceptance',
];
const DATASET_DIRECTORY = 'src/collections/content-learning/services/';
const DATASET_UNIT = `${DATASET_DIRECTORY}learning-dataset.service.spec.ts`;
const DATASET_PG = `${DATASET_DIRECTORY}learning-dataset.postgres.spec.ts`;
const DATASET_SUITE = 'dataset atomic scalability on isolated PostgreSQL';
const MATRIX_TITLE = `${DATASET_SUITE} measures 1k/10k/100k owned and consented three times after warmup plus mixed`;
const SMOKE_TITLE = `${DATASET_SUITE} checks one 10k owned, consented and mixed snapshot for deployment`;
const DIAGNOSTIC_TITLE = `${DATASET_SUITE} profiles one 10k and one 100k consented snapshot without replacing acceptance matrix`;
export const PG_TITLES = [
  'creates genuine publication/capture/materializer lineage and exact scalar/bulk dataset pins',
  'excludes publication authority corruption while standalone pin digest remains independent',
  'actual exclusive publication writer waits behind snapshot F and invalidates after commit; inverse order excludes',
  'serializes identical requests, rejects conflicts and rolls back entry/edge failures',
  'rejects source/consent identity changes and owned/consented fingerprint collisions',
  'excludes deleted, synthetic, wrong-account, pre-consent and invalid-pinned observations',
  'aborts a complete snapshot when a newer reward commits before final locks',
  'blocks a newer reward behind actual service locks then invalidates the committed dataset and preserves retry',
  'exclusive consent revocation waits for an actual snapshot then follows the deduplicated edge',
  'pages past ineligible candidates and excludes latest invalid or post-cutoff versions',
].map((title) => `${DATASET_SUITE} ${title}`);
export const BRAND_PATH =
  'apps/server/api/test/integration/branded-generation/branded-generation-receipts.integration.spec.ts';
export const STORAGE_PATHS = [
  'packages/storage/src/bounded-storage-read.spec.ts',
  'packages/storage/__tests__/local-storage.provider.test.ts',
  'packages/storage/__tests__/s3-storage.provider.test.ts',
  'packages/storage/__tests__/storage-provider.factory.test.ts',
  'packages/storage/src/local-storage.provider.spec.ts',
  'packages/storage/src/path-containment.spec.ts',
];
export const BRAND_SOURCE_CONTRACT = {
  sourceInputs: [
    {
      path: 'apps/server/api/test/helpers/migration-deploy-diagnostics.ts',
      sha256:
        'c0f748ea4ca648200c9803e21f765fbbff7ffead28af26c4caf85cc0d2e269f0',
    },
    {
      path: 'apps/server/api/test/helpers/controller-owned-migration-database.ts',
      sha256:
        '0f69ff1cb157b97265f44dc5ee73c1d8fe45574ac03b979d90e2defe7ec24aa8',
    },
  ],
  brand: {
    path: 'apps/server/api/test/integration/branded-generation/branded-generation-receipts.integration.spec.ts',
    sha256: 'b79d6ffb8e84be00a6c6c7f610300641254c5f2b801901bca4911714964e239a',
    passedTitles: [
      'branded receipt full-migration service and relocation acceptance serializes same-input create, rejects changed payloads, and isolates other scopes',
      'branded receipt full-migration service and relocation acceptance commits one competing revision and replays immutable event projections',
      'branded receipt full-migration service and relocation acceptance rolls aggregate, event and prompt writes back on actual event-trigger failure',
      'branded receipt full-migration service and relocation acceptance enforces production constraints and immutable rows in explicit rollback transactions',
      'branded receipt full-migration service and relocation acceptance purges payloads without erasing scoped uniqueness or immutable history',
      'branded receipt full-migration service and relocation acceptance retains a real compiled recipe once across concurrent operation owners and preserves legacy reads',
      'branded receipt full-migration service and relocation acceptance applies compiled-only linkage, foreign-scope rejection and unchanged immutability after full migrations',
      'branded receipt full-migration service and relocation acceptance rejects actually encrypted retained-input and recipe tampering without weakening immutable rows',
      'branded receipt full-migration service and relocation acceptance rolls compiled envelope, enhanced prompt, event and projection back on actual event failure',
      'branded receipt full-migration service and relocation acceptance purges both branded formats while preserving unrelated legacy payloads',
      'branded receipt full-migration service and relocation acceptance accepts the completion chain, enforces provider uniqueness and recovers expired dispatch windows',
      'branded receipt full-migration service and relocation acceptance requires the active relocation history guard for live and tombstoned receipts',
      'branded receipt full-migration service and relocation acceptance observes receipt-first Brand ownership before the relocation contender enters PostgreSQL',
      'branded receipt full-migration service and relocation acceptance observes move-first Brand ownership and refuses an old-scope receipt after the move',
      'branded receipt full-migration service and relocation acceptance retains exact encrypted original "" and real membership access',
      'branded receipt full-migration service and relocation acceptance retains exact encrypted original "  \\t\\n " and real membership access',
      'branded receipt full-migration service and relocation acceptance retains exact encrypted original "Caf\u00e9 \ud83d\ude00\\r\\n" and real membership access',
    ],
  },
  unitFiles: [
    {
      path: 'apps/server/api/src/services/branded-generation-receipts/branded-generation-prompt-store.service.spec.ts',
      sha256:
        'dcf662980663ee426d77896f09d21b4a986ad6a8ed00a2e494ea0b2903fb60bc',
      acceptance:
        'nonzero passed in this exact file; no failed/pending/skipped/todo',
    },
    {
      path: 'apps/server/api/src/services/branded-generation-receipts/branded-generation-receipts.service.spec.ts',
      sha256:
        'e121d769cabadc1b1601f103745013b275c20786971401c3db7feb8801456d30',
      acceptance:
        'nonzero passed in this exact file; no failed/pending/skipped/todo',
    },
    {
      path: 'apps/server/api/src/services/branded-generation-receipts/branded-generation-recompile-codec.util.spec.ts',
      sha256:
        '48f411eef83cb5e5562ad5f073f5ccb6b1cba96a916b7668ad2829f6e5aab4aa',
      acceptance:
        'nonzero passed in this exact file; no failed/pending/skipped/todo',
    },
    {
      path: 'apps/server/api/src/services/harness/branded-generation-compiler.spec.ts',
      sha256:
        '401c51ddee2c6cea40ccc712988619be54686acd6f0909893bd05800813242a2',
      acceptance:
        'nonzero passed in this exact file; no failed/pending/skipped/todo',
    },
  ],
};
/**
 * The six storage specs the final acceptance runs, with their sha256 and exact
 * passing titles. Editing one of these specs means updating its entry here in
 * the same pull request.
 */
export const STORAGE_SOURCE_CONTRACT = [
  {
    path: 'packages/storage/src/bounded-storage-read.spec.ts',
    sha256: '0415d4f132c3762bb7bda7524fa2f46311ae10b65c82f58d21d09009d4c829d0',
    passedTitles: [
      'bounded payload collection and cancellation ownership rejects byte budget 0 before allocation',
      'bounded payload collection and cancellation ownership rejects byte budget -1 before allocation',
      'bounded payload collection and cancellation ownership rejects byte budget 0.5 before allocation',
      'bounded payload collection and cancellation ownership rejects byte budget 20971521 before allocation',
      'bounded payload collection and cancellation ownership rejects byte budget 9007199254740992 before allocation',
      'bounded payload collection and cancellation ownership rejects deadline 0',
      'bounded payload collection and cancellation ownership rejects deadline -1',
      'bounded payload collection and cancellation ownership rejects deadline 0.5',
      'bounded payload collection and cancellation ownership rejects deadline 30001',
      'bounded payload collection and cancellation ownership validates runtime signal, preserves first cancellation, and disposes timer/listener',
      'bounded payload collection and cancellation ownership collects exact boundary and offset byte views without concatenation',
      'bounded payload collection and cancellation ownership destroys dishonest stream with storage_read_limit_exceeded',
      'bounded payload collection and cancellation ownership destroys dishonest stream with storage_read_changed',
      'bounded payload collection and cancellation ownership destroys dishonest stream with storage_read_invalid_response',
      'bounded payload collection and cancellation ownership rejects invalid/oversized expected metadata before allocating',
      'bounded payload collection and cancellation ownership aborts a stalled body by deadline and awaits destruction',
      'bounded payload collection and cancellation ownership rejects already aborted without a read and handles external midstream cancellation',
      'bounded payload collection and cancellation ownership sanitizes foreign errors without invoking arbitrary coercion',
      'bounded payload collection and cancellation ownership rejects genuine emitClose:false before reading or allocation without a close wait',
      'bounded payload collection and cancellation ownership runs final stability callback before destroy and waits for delayed native close',
      'bounded payload collection and cancellation ownership keeps cancellation live during final callback and awaits error-close cleanup',
      'bounded payload collection and cancellation ownership sanitizes callback errors after closing the native body',
      'terminal native close ownership waits for close and preserves success outcome',
      'terminal native close ownership waits for close and preserves changed outcome',
      'terminal native close ownership waits for close and preserves aborted outcome',
      'does not return bytes when deadline expires during successful native close',
    ],
  },
  {
    path: 'packages/storage/__tests__/local-storage.provider.test.ts',
    sha256: 'c961232589d93cf03022da6deb8969fb751cf3281b1e1cf26d4bca9e4fae7811',
    passedTitles: [
      'LocalStorageProvider upload writes buffer under base dir and returns the path',
      'LocalStorageProvider uploadFromFile copies a local file into storage',
      'LocalStorageProvider uploadFromFile throws when the source file does not exist',
      'LocalStorageProvider download copies a stored file to a local path, creating directories',
      'LocalStorageProvider download throws when the stored file does not exist',
      'LocalStorageProvider listObjects recursively lists all files under a prefix with size and mtime',
      'LocalStorageProvider listObjects returns empty array for unknown prefix',
      'LocalStorageProvider existing surface exists / delete / list still behave',
      'LocalStorageProvider native bounded reads returns exact stored bytes and rejects oversized metadata',
      'LocalStorageProvider native bounded reads rejects unsafe key ../escape',
      'LocalStorageProvider native bounded reads rejects unsafe key /absolute',
      'LocalStorageProvider native bounded reads rejects unsafe key https://private.invalid/key',
      'LocalStorageProvider native bounded reads rejects symlinks and already-aborted reads without opening a payload stream',
      'LocalStorageProvider native bounded reads rejects source grow after actual payload collection',
      'LocalStorageProvider native bounded reads rejects source truncate after actual payload collection',
      'LocalStorageProvider native bounded reads rejects source rewrite after actual payload collection',
      'LocalStorageProvider native bounded reads accepts exact 20MiB and closes resources so the file can be removed',
      'LocalStorageProvider checks stability on the open native descriptor and closes before returning, including empty files',
      'LocalStorageProvider returns a local pin and rejects it after a rewrite',
      'LocalStorageProvider rejects an oversized versioned file',
    ],
  },
  {
    path: 'packages/storage/__tests__/s3-storage.provider.test.ts',
    sha256: 'b1a746ca9b28341eb9a33ddc7909cbbfc1eebe578c3af50f045f7ae7cb5381e9',
    passedTitles: [
      'S3StorageProvider constructor options uses explicit options over environment',
      'S3StorageProvider constructor options uses an explicit AWS profile instead of stale static credentials',
      'S3StorageProvider constructor options publishes through GENFEEDAI_CDN_URL instead of the raw S3 host',
      'S3StorageProvider constructor options uses an explicit cdnUrl option over the files microservice origin',
      'S3StorageProvider object-key containment rejects unsafe key ../escaped.png before sending an S3 command',
      'S3StorageProvider object-key containment rejects unsafe key /absolute.png before sending an S3 command',
      'S3StorageProvider object-key containment rejects unsafe key nested\\escaped.png before sending an S3 command',
      'S3StorageProvider object-key containment rejects unsafe key nested/%2e%2e/escaped.png before sending an S3 command',
      'S3StorageProvider object-key containment rejects unsafe key nested/%252e%252e/escaped.png before sending an S3 command',
      'S3StorageProvider object-key containment rejects unsafe key nested%2fescaped.png before sending an S3 command',
      'S3StorageProvider object-key containment accepts and preserves a legitimate nested object key',
      'S3StorageProvider uploadFromFile streams the local file through lib-storage Upload',
      'S3StorageProvider uploadFromFile rejects unsafe local source ../outside.mp4 before filesystem access',
      'S3StorageProvider uploadFromFile rejects unsafe local source nested\\outside.mp4 before filesystem access',
      'S3StorageProvider uploadFromFile rejects unsafe local source nested/%2e%2e/outside.mp4 before filesystem access',
      'S3StorageProvider uploadFromFile rejects unsafe local source nested/%252e%252e/outside.mp4 before filesystem access',
      'S3StorageProvider uploadFromFile respects an explicit content type and maps safetensors/pth to octet-stream',
      'S3StorageProvider download streams the object body to a local path, creating directories',
      'S3StorageProvider download rejects a destination that escapes the caller-owned root',
      'S3StorageProvider download throws on empty response body',
      'S3StorageProvider delete sends a DeleteObjectCommand for the validated key',
      'S3StorageProvider delete rejects traversal before sending a delete command',
      'S3StorageProvider list maps S3 contents to file entries with url, type and metadata',
      'S3StorageProvider list defaults missing Key, Size and LastModified fields',
      'S3StorageProvider list returns an empty list when the response has no Contents',
      'S3StorageProvider list filters by type and applies offset and limit after filtering',
      'S3StorageProvider list keeps every entry when type filter is "all"',
      'S3StorageProvider list rejects an unsafe prefix before sending a list command',
      'S3StorageProvider exists returns true when the head request succeeds',
      'S3StorageProvider exists returns false when the head request fails with NotFound',
      'S3StorageProvider exists returns false when the head request fails with NoSuchKey',
      'S3StorageProvider exists rethrows unexpected errors',
      'S3StorageProvider listObjects paginates through continuation tokens and maps object metadata',
      'S3StorageProvider listObjects skips entries missing Key or Size and handles empty listings',
      'S3StorageProvider native bounded conditional reads pins HEAD ETag/version and returns raw exact bytes without decoding descriptive encoding',
      'S3StorageProvider native bounded conditional reads rejects invalid HEAD before GET (case 0)',
      'S3StorageProvider native bounded conditional reads rejects invalid HEAD before GET (case 1)',
      'S3StorageProvider native bounded conditional reads rejects invalid HEAD before GET (case 2)',
      'S3StorageProvider native bounded conditional reads rejects invalid HEAD before GET (case 3)',
      'S3StorageProvider native bounded conditional reads maps 412 to changed without another HEAD or GET',
      'S3StorageProvider native bounded conditional reads destroys changed response size',
      'S3StorageProvider native bounded conditional reads destroys changed response etag',
      'S3StorageProvider native bounded conditional reads destroys changed response version',
      'S3StorageProvider native bounded conditional reads destroys changed response range',
      'S3StorageProvider native bounded conditional reads destroys changed response encoding',
      'S3StorageProvider native bounded conditional reads deadline covers stalled first-byte and destroys body',
      'S3StorageProvider native bounded conditional reads deadline covers stalled mid-body and destroys body',
      'S3StorageProvider native bounded conditional reads deadline aborts stalled HEAD request, and pre-aborted calls perform no I/O',
      'S3StorageProvider native bounded conditional reads external abort stops body and excess chunks abort the shared transport',
      'bounded GET terminal cleanup awaits native close on metadata mismatch=true',
      'bounded GET terminal cleanup awaits native close on metadata mismatch=false',
      'S3StorageProvider readVersionedBytes returns the pin captured by the read (version-1)',
      'S3StorageProvider readVersionedBytes returns the pin captured by the read (undefined)',
      'S3StorageProvider readVersionedBytes rejects an oversized versioned object before GET',
      'S3StorageProvider readVersionedBytes rejects a stale pin before sending GET',
    ],
  },
  {
    path: 'packages/storage/__tests__/storage-provider.factory.test.ts',
    sha256: 'd3922d1ea953aa366787d3ea71ce28352cb4540112720d0e41994c54450250d9',
    passedTitles: [
      'createStorageProvider roots the local driver at the desktop userData directory',
      'createStorageProvider returns LocalStorageProvider when self-hosted',
      'createStorageProvider returns S3StorageProvider with options when cloud',
      'createStorageProvider returns additive bounded capability for cloud provider',
    ],
  },
  {
    path: 'packages/storage/src/local-storage.provider.spec.ts',
    sha256: '9710ecf3366c4d0c49c1e8fa2448b1e5a957726e535ef7c6d148e557f18227fd',
    passedTitles: [
      'LocalStorageProvider path containment upload rejects ../escaped.txt',
      'LocalStorageProvider path containment upload rejects ../../etc/passwd',
      'LocalStorageProvider path containment upload rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment upload rejects ..',
      'LocalStorageProvider path containment upload rejects /etc/passwd',
      'LocalStorageProvider path containment upload rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment upload writes inside the storage root for an ordinary path',
      'LocalStorageProvider path containment uploadFromFile rejects ../escaped.txt',
      'LocalStorageProvider path containment uploadFromFile rejects ../../etc/passwd',
      'LocalStorageProvider path containment uploadFromFile rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment uploadFromFile rejects ..',
      'LocalStorageProvider path containment uploadFromFile rejects /etc/passwd',
      'LocalStorageProvider path containment uploadFromFile rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment download rejects ../escaped.txt',
      'LocalStorageProvider path containment download rejects ../../etc/passwd',
      'LocalStorageProvider path containment download rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment download rejects ..',
      'LocalStorageProvider path containment download rejects /etc/passwd',
      'LocalStorageProvider path containment download rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment download rejects destination ../escaped.txt',
      'LocalStorageProvider path containment download rejects destination ../../etc/passwd',
      'LocalStorageProvider path containment download rejects destination nested/../../escaped.txt',
      'LocalStorageProvider path containment download rejects destination ..',
      'LocalStorageProvider path containment download rejects destination /etc/passwd',
      'LocalStorageProvider path containment download rejects destination /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment delete rejects ../escaped.txt',
      'LocalStorageProvider path containment delete rejects ../../etc/passwd',
      'LocalStorageProvider path containment delete rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment delete rejects ..',
      'LocalStorageProvider path containment delete rejects /etc/passwd',
      'LocalStorageProvider path containment delete rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment delete unlinks inside the storage root for an ordinary path',
      'LocalStorageProvider path containment list rejects ../escaped.txt',
      'LocalStorageProvider path containment list rejects ../../etc/passwd',
      'LocalStorageProvider path containment list rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment list rejects ..',
      'LocalStorageProvider path containment list rejects /etc/passwd',
      'LocalStorageProvider path containment list rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment list reads the resolved directory for an ordinary prefix',
      'LocalStorageProvider path containment listObjects rejects ../escaped.txt',
      'LocalStorageProvider path containment listObjects rejects ../../etc/passwd',
      'LocalStorageProvider path containment listObjects rejects nested/../../escaped.txt',
      'LocalStorageProvider path containment listObjects rejects ..',
      'LocalStorageProvider path containment listObjects rejects /etc/passwd',
      'LocalStorageProvider path containment listObjects rejects /srv/genfeed/files-sibling/escaped.txt',
      'LocalStorageProvider path containment exists rejects ../escaped.txt rather than probing it',
      'LocalStorageProvider path containment exists rejects ../../etc/passwd rather than probing it',
      'LocalStorageProvider path containment exists rejects nested/../../escaped.txt rather than probing it',
      'LocalStorageProvider path containment exists rejects .. rather than probing it',
      'LocalStorageProvider path containment exists rejects /etc/passwd rather than probing it',
      'LocalStorageProvider path containment exists rejects /srv/genfeed/files-sibling/escaped.txt rather than probing it',
      'LocalStorageProvider path containment rejects a non-string path',
      'LocalStorageProvider rooted at the desktop userData directory resolves the userData root from the desktop data directory',
      'LocalStorageProvider rooted at the desktop userData directory writes inside the userData root for an ordinary path',
      'LocalStorageProvider rooted at the desktop userData directory rejects ../pglite-db/postgres rather than touching the real disk',
      'LocalStorageProvider rooted at the desktop userData directory rejects ../../Preferences/com.apple.finder.plist rather than touching the real disk',
      'LocalStorageProvider rooted at the desktop userData directory rejects ingredients/../../../.ssh/id_rsa rather than touching the real disk',
      'LocalStorageProvider rooted at the desktop userData directory rejects /etc/passwd rather than touching the real disk',
      'LocalStorageProvider rooted at the desktop userData directory rejects /Users/example/Library/Application Support/Genfeed/files-sibling/escaped.png rather than touching the real disk',
      'LocalStorageProvider rooted at the desktop userData directory rejects linked.png once a symlink is planted under the root',
      'LocalStorageProvider rooted at the desktop userData directory rejects linked-dir/photo.png once a symlink is planted under the root',
    ],
  },
  {
    path: 'packages/storage/src/path-containment.spec.ts',
    sha256: '5c0f041dd3f02999591a7be2d9add33d8de9820c6060872b4ed0531be73c31ce',
    passedTitles: [
      'path containment accepts a legitimate nested filesystem path',
      'path containment rejects filesystem escape ../escaped.txt',
      'path containment rejects filesystem escape nested/../../escaped.txt',
      'path containment rejects filesystem escape /etc/passwd',
      'path containment rejects filesystem escape /srv/genfeed/files-sibling/file.txt',
      'path containment rejects ambiguous filesystem syntax nested/../file.txt',
      'path containment rejects ambiguous filesystem syntax nested\\file.txt',
      'path containment rejects ambiguous filesystem syntax C:/Windows/System32/config',
      'path containment rejects ambiguous filesystem syntax nested/%2e%2e/file.txt',
      'path containment rejects ambiguous filesystem syntax nested/%252e%252e/file.txt',
      'path containment rejects ambiguous filesystem syntax nested%2ffile.txt',
      'path containment rejects a missing containment root',
      'path containment rejects a missing candidate path',
      'path containment allows a candidate that resolves to the root itself',
      'symlink containment under a userData root accepts a real nested path below the root',
      'symlink containment under a userData root rejects lexical escape ../pglite-db/postgres',
      'symlink containment under a userData root rejects lexical escape ../../.ssh/id_rsa',
      'symlink containment under a userData root rejects lexical escape nested/../../escaped.png',
      'symlink containment under a userData root rejects lexical escape /etc/passwd',
      'symlink containment under a userData root rejects a file symlink pointing outside the root',
      'symlink containment under a userData root rejects a path routed through a linked directory',
      'symlink containment under a userData root rejects a dangling symlink, which a write would follow out of the root',
      'symlink containment under a userData root rejects a symlink even when it points back inside the root',
      'symlink containment under a userData root ignores symlinked ancestors of the root itself',
      'object-key containment preserves a legitimate nested key beneath the prefix',
      'object-key containment rejects object-key escape ../escaped.png',
      'object-key containment rejects object-key escape nested/../../escaped.png',
      'object-key containment rejects object-key escape /absolute.png',
      'object-key containment rejects object-key escape nested\\escaped.png',
      'object-key containment rejects object-key escape nested//empty.png',
      'object-key containment rejects object-key escape ./same.png',
      'object-key containment rejects object-key escape nested/%2e%2e/escaped.png',
      'object-key containment rejects object-key escape nested/%252e%252e/escaped.png',
      'object-key containment rejects object-key escape nested%2fescaped.png',
      'object-key containment validates a legitimate nested key without imposing a prefix',
      'object-key containment preserves harmless percent-encoded bytes in a legitimate nested key',
      'object-key containment preserves an empty bucket-root listing prefix',
      'object-key containment rejects an empty or non-string object key',
      'object-key containment rejects a leading slash in an object key',
      'object-key containment rejects backslash or NUL separator confusion in an object key',
      'object-key containment rejects a trailing slash on a concrete object key',
      'object-key containment accepts a listing prefix that ends with a slash',
      'object-key containment rejects a traversal object-key segment',
      'object-key containment rejects object-key segment .',
      'object-key containment rejects object-key segment nested//empty.png',
      'object-key containment rejects object-key segment ./same.png',
    ],
  },
];
/**
 * The release owner contract (BRAND integration spec plus storage specs). It
 * lives in code next to the other frozen pins; specs may inject a synthetic
 * contract through the environment.
 */
export const OWNER_CONTRACT = {
  version: 1,
  brand: BRAND_SOURCE_CONTRACT.brand,
  storage: STORAGE_SOURCE_CONTRACT,
};
export function ownerContractFrom(env) {
  return env?.RUNTIME_ACCEPTANCE_OWNER_CONTRACT ?? OWNER_CONTRACT;
}
export const CRUN_SOURCE_CONTRACT = Object.freeze({
  image: Object.freeze({
    path: 'apps/server/api/src/services/integrations/crun/crun-image-flow.integration.spec.ts',
    sha256: '19ebcf4d0e81a380900d2d1ce7f638e5694a924fcff2eb8aa88c366ff91a7cdd',
    count: 18,
    passedTitles: Object.freeze([
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario mixed: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario failed: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario refused: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario deferred: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario disabled: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario ambiguous: frozen quote, restart, owned storage and exact accounting',
    ]),
  }),
  video: Object.freeze({
    path: 'apps/server/api/src/services/integrations/crun/crun-video-flow.integration.spec.ts',
    sha256: 'a0d530c2cab376cd23f789e25ce29b722870af658255ba89f2699f6953c01882',
    count: 23,
    passedTitles: Object.freeze([
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario mixed variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario failed variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario refused variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario deferred variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario disabled variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario ambiguous variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant 10s: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant start: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant end: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant 1080p: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant 4k: frozen quote, restart, owned storage and exact accounting',
    ]),
  }),
});
const CRUN_STAGE_MEDIA = Object.freeze({
  'crun-image': 'image',
  'crun-video': 'video',
});
export const BASELINE_SOURCE_CONTRACT = {
  sourceCommit: 'ec218e3b73e32f2d64813496d63d3d1998c2ca1e',
  sourceInputs: [
    {
      path: 'packages/prisma/prisma/content-learning-baseline-materialization-migration.test.ts',
      sha256:
        'ad817a2ad7b8eba1cd6eb7d431b981dc908bc4509eaa4149e4b159fd75894887',
    },
    {
      path: 'packages/prisma/prisma/migrations/20261001220000_content_learning_baseline_materialization/migration.sql',
      sha256:
        'f68efafc6265c5c0dd19292b0419e21e586f1582db8ea782d89c3f0c542476d5',
    },
    {
      path: 'packages/prisma/prisma/migrations/20260930180000_content_learning/migration.sql',
      sha256:
        '3e8d683a0374b900e6c64908421a7bf6f84ebae49b5ad144a689199ff2b0a44b',
    },
  ],
  passedTitles: [
    'baseline materialization additive source contract adds only nullable fields and the ordered nonunique lookup index',
    'baseline materialization additive source contract requires actual generated baseline metadata after the separate codegen lease',
    'baseline materialization actual PostgreSQL migration preserves every legacy value and verifies actual nullable column/catalog constraints',
    'baseline materialization actual PostgreSQL migration accepts legacy null tuples, empty counters, and nonempty equality or later expiry',
    'baseline materialization actual PostgreSQL migration rejects partial, negative and invalid-expiry tuples independently with the exact check',
    'baseline materialization actual PostgreSQL migration keeps the seven-column index nonunique with exact scope and descending tail',
    'baseline materialization actual PostgreSQL migration isolates the illustrative epoch/evidence/cutoff/expiry predicate at the inclusive boundary',
  ],
  expectedSourceCases: 2,
  expectedPostgresCases: 5,
  runtimeQualified: false,
};
export async function verifyFrozenSources(repo, entries) {
  for (const entry of entries) {
    requireThat(
      (await lstat(path.join(repo, entry.path))).size <= RAW_LIMIT,
      'UNSAFE_SOURCE',
    );
    await verifySource(repo, entry);
  }
}
export async function verifyBaselineSources(repo) {
  await verifyFrozenSources(repo, BASELINE_SOURCE_CONTRACT.sourceInputs);
}
export const AGENT_PRODUCTION_FILES = [
  {
    path: 'apps/server/api/test/integration/proactive-agent-production-turn.integration.spec.ts',
    sha256: '12571f679240c51920554aa0cb8ee50c4f503784de1560b99eafeb6ce4e85fbd',
  },
  {
    path: 'apps/server/api/test/integration/proactive-agent-production-turn.fixture.ts',
    sha256: '70953ea3931ee8d08d1c084972adfd50bf0d4544cdca7489cbc2919cd683e156',
  },
  {
    path: 'apps/server/api/test/integration/proactive-agent-production-turn-cleanup.util.ts',
    sha256: '96740275d53505cc99d8b3be00c2073d524af9aaee2ec69d1e6742db3f8b0778',
  },
];
export const AGENT_PRODUCTION_TITLES = [
  'proactive production turn acceptance runs a paid text turn through the real worker and settles its actual reservation once',
  'proactive production turn acceptance releases the real financial hold when the external inference call fails',
  'proactive production turn acceptance requires the real authorizer to produce a strategy-attributed draft without fabricated confirmation',
  'proactive production turn acceptance holds the real dispatch backend beyond thirty seconds while a paid provider round is pending',
  'proactive production turn acceptance rejects a terminated owned dispatch backend before admission without a reservation or failure increment',
  'proactive production turn acceptance recovers an accepted enqueue after owned backend loss with one durable paid identity',
];

// Source-only freeze point. Populate from the writer's committed files and
// exact collected cases before qualifying final; no environment override.
export const LEARNING_SOURCE_CONTRACT = Object.freeze({
  version: 1,
  qualified: true,
  sourceInputs: [
    {
      path: 'apps/server/api/test/integration/content-learning/content-learning-runtime.fixture.ts',
      sha256:
        '59da379349805420f2b6c41eaf3b695c30c96fdfd12e6c66a228fa0fd984faad',
    },
    {
      path: 'apps/server/api/test/integration/content-learning/content-learning-runtime.integration.spec.ts',
      sha256:
        'd252d5dfc382b160136dcb0ef0daa62ad9e7661f9139059c8b0ce07d64dbbe0b',
    },
    {
      path: 'apps/server/api/test/integration/content-learning/content-learning-publication-races.integration.spec.ts',
      sha256:
        '64a72190aa29dfbe3335923615757bc29203ac23eeb7f46640e64fbe2ef30319',
    },
    {
      path: 'apps/server/api/vitest.learning-runtime.config.ts',
      sha256:
        '503ce881f32b01c51fdb8fc3712ac711ecd52154b145791c8c49322df4e4bd89',
    },
    {
      path: 'apps/server/api/test/helpers/migration-deploy-diagnostics.ts',
      sha256:
        'c0f748ea4ca648200c9803e21f765fbbff7ffead28af26c4caf85cc0d2e269f0',
    },
    {
      path: 'apps/server/api/test/helpers/controller-owned-migration-database.ts',
      sha256:
        '0f69ff1cb157b97265f44dc5ee73c1d8fe45574ac03b979d90e2defe7ec24aa8',
    },
  ],
  suites: [
    {
      file: 'test/integration/content-learning/content-learning-runtime.integration.spec.ts',
      count: 14,
      titles: [
        'hosted real production learning runtime mounts real cloud configuration, singleton runner, registrars, v2 graphs and owned routing without duplicate processors',
        'hosted real production learning runtime collects twenty genuine approved publications and materializes a twenty-contributor baseline through the actual background engine',
        'hosted real production learning runtime coalesces an inflight refresh and replays terminal jobs while preserving checkpoint, evidence and immutable publication association',
        'hosted real production learning runtime retains materializationOnly=true and refreshBucket=0 through the real v2 converter',
        'hosted real production learning runtime retains materializationOnly=false and refreshBucket=0 through the real v2 converter',
        'hosted real production learning runtime persists a closed-engine failure for invalid typed reconcile input {"materializationOnly":"false"} without learning writes',
        'hosted real production learning runtime persists a closed-engine failure for invalid typed reconcile input {"refreshBucket":"0"} without learning writes',
        'hosted real production learning runtime persists a closed-engine failure for invalid typed reconcile input {"refreshBucket":-1} without learning writes',
        'hosted real production learning runtime rejects an unknown action parameter in a real test graph before the production executor',
        'hosted real production learning runtime rejects cross-tenant credential authority and independently executes the second tenant',
        'hosted real production learning runtime preserves the actual first checkpoint reason:null through engine output validation',
        'hosted real production learning runtime persists legacy raw analytics while preserving checkpointId:null and observation_receipt_missing',
        'hosted real production learning runtime disposes invalid stored dispatch through the real dataset action and preserves runStatus:null without training',
        'hosted real production learning runtime retains provider-observed zero separately from unavailable saves',
      ],
    },
    {
      file: 'test/integration/content-learning/content-learning-publication-races.integration.spec.ts',
      count: 51,
      titles: [
        'hosted actual learning publication contention and atomicity scheduler-withdrawal serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity scheduler-withdrawal serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity scheduler-withdrawal serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity scheduler-withdrawal serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-patch serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-patch serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-patch serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-patch serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-remove serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-remove serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-remove serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity post-remove serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-disconnect serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-disconnect serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-disconnect serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-disconnect serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-bulk serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-bulk serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-bulk serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-bulk serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-oauth serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-oauth serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-oauth serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity credential-oauth serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-deactivate serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-deactivate serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-deactivate serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-deactivate serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-remove serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-remove serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-remove serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity brand-remove serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity organization-remove serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity organization-remove serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity organization-remove serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity organization-remove serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity child-create serializes capture in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity child-create serializes capture in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity child-create serializes materializer in projection-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity child-create serializes materializer in source-first with actual fence/account locks and retained invalidation',
        'hosted actual learning publication contention and atomicity rolls back actual source mutation when content_learning_dependencys invalidation fails',
        'hosted actual learning publication contention and atomicity rolls back actual source mutation when content_learning_accounts invalidation fails',
        'hosted actual learning publication contention and atomicity rolls back baseline creation and all contributor links when content_learning_baselines insert fails',
        'hosted actual learning publication contention and atomicity rolls back baseline creation and all contributor links when content_learning_dependencys insert fails',
        'hosted actual learning publication contention and atomicity rolls back provider-confirmed Post state, new immutable association and account revision in the same actual Scheduler transaction',
        'hosted actual learning publication contention and atomicity rejects stale provider guards without changing timestamps, result, processing markers or evidence counters',
        'hosted actual learning publication contention and atomicity preserves a legacy outbox without upgrading it into publication authority',
        'hosted actual learning publication contention and atomicity observes real F-before-account and account-before-source contention without a table-lock proxy',
        'hosted actual learning publication contention and atomicity rejects stale preread sources and cross-tenant identity collisions without victim evidence writes',
        'hosted actual learning publication contention and atomicity fails the actual validator after one of the eight real source edges is corrupted',
        'hosted actual learning publication contention and atomicity rejects actual child creation against an EXECUTING parent lease even when its current approval pointer is null',
      ],
    },
  ],
  cleanupReceipts: 2,
});
export const FINAL_LEARNING_BUDGET = Object.freeze({
  work: 540000,
  cleanup: 60000,
  total: 600000,
});
export function requireLearningSourceContract(
  contract = LEARNING_SOURCE_CONTRACT,
) {
  requireThat(
    contract?.version === 1 && contract.qualified === true,
    'LEARNING_INVENTORY_UNQUALIFIED',
  );
  requireThat(
    Array.isArray(contract.sourceInputs) &&
      contract.sourceInputs.length === 6 &&
      contract.sourceInputs.every(
        (entry, index) =>
          entry.path === LEARNING_SOURCE_CONTRACT.sourceInputs[index].path &&
          HASH.test(entry.sha256 ?? ''),
      ) &&
      Array.isArray(contract.suites) &&
      contract.suites.length === 2 &&
      Number.isSafeInteger(contract.cleanupReceipts) &&
      contract.cleanupReceipts > 0 &&
      contract.cleanupReceipts <= 1000,
    'INVALID_LEARNING_INVENTORY',
  );
  const titles = new Set();
  for (const [index, suite] of contract.suites.entries()) {
    requireThat(
      suite.file === LEARNING_SOURCE_CONTRACT.suites[index].file &&
        Number.isSafeInteger(suite.count) &&
        suite.count > 0 &&
        suite.count <= 1000 &&
        Array.isArray(suite.titles) &&
        suite.titles.length === suite.count,
      'INVALID_LEARNING_INVENTORY',
    );
    for (const title of suite.titles) {
      requireThat(
        typeof title === 'string' &&
          title.trim() === title &&
          title.length > 0 &&
          !titles.has(title),
        'INVALID_LEARNING_INVENTORY',
      );
      titles.add(title);
    }
  }
  return contract;
}
export function learningCiIdentity(env) {
  const runId = env.RUNTIME_ACCEPTANCE_CI_RUN_ID;
  const runAttempt = env.RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT;
  const job = env.RUNTIME_ACCEPTANCE_CI_JOB;
  requireThat(
    env.GITHUB_ACTIONS === 'true' &&
      /^\d+$/.test(runId ?? '') &&
      /^[1-9]\d*$/.test(runAttempt ?? '') &&
      /^[A-Za-z0-9_-]{1,100}$/.test(job ?? '') &&
      runId === env.GITHUB_RUN_ID &&
      runAttempt === env.GITHUB_RUN_ATTEMPT &&
      job === env.GITHUB_JOB,
    'LEARNING_CI_IDENTITY_REQUIRED',
  );
  return { runId, runAttempt, job };
}
export function learningRedisRunId(info) {
  const entries = String(info)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('run_id:'));
  requireThat(
    entries.length === 1 && SHA.test(entries[0].slice(7)),
    'LEARNING_REDIS_IDENTITY',
  );
  return entries[0].slice(7);
}
export function requireLearningRedisBlank(keyspace, sizes) {
  requireThat(
    String(keyspace)
      .split(/\r?\n/)
      .every((line) => !/^db\d+:/.test(line)) &&
      Array.isArray(sizes) &&
      sizes.length === 5 &&
      sizes.every((size) => String(size).trim() === '0'),
    'LEARNING_REDIS_NOT_EMPTY',
  );
}
export function buildLearningRedisReceipt(
  identity,
  env,
  inspected,
  insideInfo,
  endpointInfo,
  now = Date.now(),
) {
  const ci = learningCiIdentity(env);
  requireThat(
    identity.group === 'final' &&
      SHA.test(identity.candidateSHA ?? '') &&
      JSON.stringify(identity.learningCi) === JSON.stringify(ci),
    'LEARNING_CI_IDENTITY_REQUIRED',
  );
  const containerId = env.RUNTIME_ACCEPTANCE_REDIS_ID;
  requireThat(
    HASH.test(containerId ?? '') &&
      containerId === identity.resources.redis &&
      inspected?.Id === containerId &&
      /^sha256:[a-f0-9]{64}$/.test(inspected.Image ?? '') &&
      inspected.State?.Running === true &&
      inspected.Config?.Image === 'redis:7',
    'LEARNING_CONTAINER_IDENTITY',
  );
  const created = Date.parse(inspected.Created);
  requireThat(
    Number.isFinite(created) &&
      created <= identity.startedAt &&
      created >= identity.startedAt - 300000 &&
      now >= identity.startedAt &&
      now < identity.overallDeadline,
    'LEARNING_CONTAINER_CREATION',
  );
  requireThat(
    Array.isArray(inspected.Mounts) &&
      inspected.Mounts.every(
        (mount) =>
          mount.Type === 'volume' &&
          mount.Destination === '/data' &&
          HASH.test(mount.Name ?? ''),
      ),
    'LEARNING_PERSISTENT_VOLUME',
  );
  const ports = inspected.NetworkSettings?.Ports?.['6379/tcp'];
  requireThat(
    Array.isArray(ports) &&
      ports.some(
        (port) =>
          port.HostPort === '6379' &&
          ['127.0.0.1', '0.0.0.0', '::'].includes(port.HostIp),
      ),
    'LEARNING_CONTAINER_ENDPOINT',
  );
  const redisRunId = learningRedisRunId(insideInfo);
  requireThat(
    redisRunId === learningRedisRunId(endpointInfo),
    'LEARNING_ENDPOINT_IDENTITY',
  );
  return {
    version: 1,
    kind: 'ci-owned-redis-instance',
    candidateSHA: identity.candidateSHA,
    ...ci,
    ownerNonce: randomUUID(),
    containerId,
    imageId: inspected.Image,
    redisRunId,
    endpoint: { hostname: '127.0.0.1', port: 6379 },
    ownedDatabases: [0, 1, 2, 3, 4],
    issuedAt: new Date(now).toISOString(),
  };
}
async function learningEndpointInfo(timeout) {
  requireThat(timeout > 0, 'LEARNING_PHASE_DEADLINE');
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 6379 });
    let bytes = Buffer.alloc(0),
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(
      () => finish(new AcceptanceError('LEARNING_ENDPOINT_TIMEOUT')),
      Math.min(5000, timeout),
    );
    socket.on('error', () =>
      finish(new AcceptanceError('LEARNING_ENDPOINT_FAILED')),
    );
    socket.on('close', () => {
      if (!settled) finish(new AcceptanceError('LEARNING_ENDPOINT_CLOSED'));
    });
    socket.on('connect', () =>
      socket.write('*2\r\n$4\r\nINFO\r\n$6\r\nserver\r\n'),
    );
    socket.on('data', (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 16384)
        return finish(new AcceptanceError('LEARNING_ENDPOINT_LIMIT'));
      const headerEnd = bytes.indexOf('\r\n');
      if (headerEnd < 0) return;
      const header = bytes.subarray(0, headerEnd).toString();
      if (!/^\$[0-9]+$/.test(header))
        return finish(new AcceptanceError('LEARNING_ENDPOINT_PROTOCOL'));
      const length = Number(header.slice(1));
      if (!Number.isSafeInteger(length) || length > 16000)
        return finish(new AcceptanceError('LEARNING_ENDPOINT_LIMIT'));
      if (bytes.length < headerEnd + 2 + length + 2) return;
      if (
        bytes.length !== headerEnd + length + 4 ||
        bytes.subarray(-2).toString() !== '\r\n'
      )
        return finish(new AcceptanceError('LEARNING_ENDPOINT_PROTOCOL'));
      finish(
        null,
        bytes.subarray(headerEnd + 2, headerEnd + 2 + length).toString(),
      );
    });
  });
}
export function learningChildEnvironment(
  env,
  identity,
  resource,
  { runtimeUrl, racesUrl },
) {
  requireThat(
    identity.group === 'final' &&
      resource === identity.resources.learning &&
      resource.receipt?.candidateSHA === identity.candidateSHA &&
      resource.receipt.containerId === identity.resources.redis &&
      JSON.stringify(learningCiIdentity(env)) ===
        JSON.stringify(identity.learningCi),
    'LEARNING_RESOURCE_IDENTITY',
  );
  const credentials = readPostgresCredentials(env);
  const urls = [
    ['genfeed_learning_runtime_test', runtimeUrl],
    ['genfeed_learning_races_test', racesUrl],
  ];
  for (const [name, url] of urls) {
    validateUrl(url, 'postgres', name, credentials);
    const records = identity.resources.databases.filter(
      (entry) => entry.name === name,
    );
    requireThat(
      records.length === 1 &&
        records[0].created === true &&
        records[0].creationIntent === true &&
        records[0].intentPersisted === true &&
        records[0].creationIssued === true &&
        records[0].postgresId === serviceId(identity.resources.postgres),
      'LEARNING_DATABASE_OWNERSHIP',
    );
  }
  const runtime = new URL(runtimeUrl),
    races = new URL(racesUrl);
  requireThat(
    runtime.hostname === races.hostname &&
      runtime.port === races.port &&
      runtime.username === races.username &&
      runtime.password === races.password &&
      runtime.pathname !== races.pathname,
    'LEARNING_DATABASE_IDENTITY',
  );
  const result = {};
  for (const key of [
    'PATH',
    'HOME',
    'USER',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
  ])
    if (typeof env[key] === 'string') result[key] = env[key];
  Object.assign(result, {
    NODE_ENV: 'test',
    GENFEED_CLOUD: 'true',
    NEXT_PUBLIC_GENFEED_CLOUD: 'true',
    CI: 'true',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TURBO_TOKEN: '',
    LEARNING_RUNTIME_TEST_DATABASE_URL: runtimeUrl,
    LEARNING_RUNTIME_RACES_TEST_DATABASE_URL: racesUrl,
    LEARNING_RUNTIME_TEST_REDIS_URL: 'redis://127.0.0.1:6379/0',
    LEARNING_RUNTIME_REDIS_OWNERSHIP_RECEIPT: resource.receiptPath,
    LEARNING_RUNTIME_ACCEPTANCE_HEAD: identity.candidateSHA,
    RUNTIME_ACCEPTANCE_CI_RUN_ID: identity.learningCi.runId,
    RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT: identity.learningCi.runAttempt,
    RUNTIME_ACCEPTANCE_CI_JOB: identity.learningCi.job,
    RUNTIME_ACCEPTANCE_REDIS_ID: resource.receipt.containerId,
  });
  return result;
}

export const DELEGATED_API_FILES = [
  AGENT_PRODUCTION_FILES[0].path.slice('apps/server/api/'.length),
  BRAND_PATH.slice('apps/server/api/'.length),
];
export const LEARNING_DELEGATED_API_FILES = LEARNING_SOURCE_CONTRACT.suites.map(
  (entry) => entry.file,
);
function sharedApiDelegations(mode) {
  requireThat(
    mode === 'shared' || mode === 'final',
    'INVALID_FULL_PARTITION_MODE',
  );
  return mode === 'final'
    ? [...DELEGATED_API_FILES, ...LEARNING_DELEGATED_API_FILES]
    : DELEGATED_API_FILES;
}
export const SERIAL_BRAND_UNITS = [
  'branded-generation-hash.util.spec.ts',
  'branded-generation-receipt-access.service.spec.ts',
  'branded-generation-state.util.spec.ts',
].map((file) => `src/services/branded-generation-receipts/${file}`);
export function datasetChildEnvironment(url) {
  return {
    LEARNING_DATASET_TEST_DATABASE_URL: url,
    LEARNING_DATASET_PROFILE: '',
    LEARNING_DATASET_BENCHMARK: '',
    LEARNING_DATASET_SMOKE: '',
    LEARNING_DATASET_SEED_DIAGNOSTICS: '1',
  };
}
export const PUBLISHER_CONTRACTS = [
  {
    file: 'test/integration/batch-review-lock.integration.spec.ts',
    titles: [
      'serializes overlapping batches on one connection and unlocks after the complete operation',
      'releases every lock after a failed operation so another worker can recover',
      'does not block an independent batch/organization: independent batch',
      'does not block an independent batch/organization: independent organization',
    ].map(
      (title) => `Batch review advisory transactions (real Postgres) ${title}`,
    ),
  },
  {
    file: 'test/integration/isolated-publish/approval-mint-enqueue.integration.spec.ts',
    titles: [
      'mints a version-bound approval and enqueues due-now publish with the three ids',
      'mints a future-dated approval and does not enqueue a due-now job',
    ].map(
      (title) => `Isolated publish approval mint and enqueue (#3838) ${title}`,
    ),
  },
  {
    file: 'test/integration/isolated-publish/worker-publish-refusal.integration.spec.ts',
    titles: [
      'publishes through the fake publisher when the job carries a valid approval identity',
      'fails the post and the spec when the job is missing approval identity',
    ].map((title) => `Isolated worker publish and refusal (#3839) ${title}`),
  },
];
export function validateBrandOwnerContract(input) {
  const contract = validateOwnerContract(input);
  requireThat(
    contract.brand.sha256 === BRAND_SOURCE_CONTRACT.brand.sha256 &&
      [...contract.brand.passedTitles].sort().join('\n') ===
        [...BRAND_SOURCE_CONTRACT.brand.passedTitles].sort().join('\n'),
    'BRAND_SOURCE_CONTRACT_MISMATCH',
  );
  return contract;
}
export async function verifyDedicatedSources(repo, group, env) {
  requireThat(
    ['agent-production', 'brand-acceptance'].includes(group),
    'INVALID_GROUP',
  );
  if (group === 'brand-acceptance')
    validateBrandOwnerContract(ownerContractFrom(env));
  const files =
    group === 'agent-production'
      ? AGENT_PRODUCTION_FILES
      : [
          BRAND_SOURCE_CONTRACT.brand,
          ...BRAND_SOURCE_CONTRACT.unitFiles,
          ...BRAND_SOURCE_CONTRACT.sourceInputs,
        ];
  await verifyFrozenSources(repo, files);
}
export function validateSharedApiFullPartition(
  summary,
  report,
  apiRoot,
  mode = 'shared',
) {
  const delegated = sharedApiDelegations(mode);
  requireThat(
    summary?.tier === 'full' &&
      summary.status === 'passed' &&
      summary.vitestExitCode === 0 &&
      summary.failedFileCount === 0 &&
      report?.success === true &&
      Array.isArray(summary.selectedFiles) &&
      Array.isArray(report.testResults),
    'INVALID_FULL_PARTITION',
  );
  const selected = summary.selectedFiles;
  requireThat(
    selected.length > delegated.length &&
      new Set(selected).size === selected.length &&
      summary.selectedFileCount === selected.length &&
      selected.every(
        (file) =>
          typeof file === 'string' &&
          !path.isAbsolute(file) &&
          file
            .split('/')
            .every((part) => part && part !== '.' && part !== '..'),
      ) &&
      delegated.every((file) => selected.includes(file)),
    'INVALID_FULL_PARTITION',
  );
  const actual = report.testResults.map((file) => {
    requireThat(
      typeof file.name === 'string' && file.status === 'passed',
      'INVALID_FULL_PARTITION',
    );
    const absolute = path.isAbsolute(file.name)
      ? path.normalize(file.name)
      : path.resolve(apiRoot, file.name);
    const relative = path.relative(apiRoot, absolute);
    requireThat(
      relative && !relative.startsWith('../') && !path.isAbsolute(relative),
      'INVALID_FULL_PARTITION',
    );
    return relative;
  });
  const expected = selected.filter((file) => !delegated.includes(file));
  requireThat(
    new Set(actual).size === actual.length &&
      actual.length === summary.executedFileCount &&
      actual.length === selected.length - delegated.length &&
      [...actual].sort().join('\n') === [...expected].sort().join('\n'),
    'INVALID_FULL_PARTITION',
  );
  return {
    version: 1,
    status: 'passed',
    selectedFileCount: selected.length,
    executedFileCount: actual.length,
    mode,
    delegatedFiles: delegated.map((file) => ({
      file,
      proof: 'REQUIRED',
    })),
  };
}
export async function verifySharedApiFullPartition(repo, mode = 'shared') {
  sharedApiDelegations(mode);
  const apiRoot = path.join(await realpath(repo), 'apps/server/api');
  const read = async (file) => {
    const filename = path.join(apiRoot, 'test-results/api-e2e', file);
    requireThat(
      (await realpath(path.dirname(filename))) === path.dirname(filename),
      'UNSAFE_FULL_REPORT',
    );
    const handle = await open(
      filename,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      const metadata = await handle.stat();
      requireThat(
        metadata.isFile() &&
          metadata.uid === process.getuid() &&
          metadata.size <= RAW_LIMIT,
        'UNSAFE_FULL_REPORT',
      );
      return JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
  };
  const partition = validateSharedApiFullPartition(
    await read('full.json'),
    await read('vitest-full.json'),
    apiRoot,
    mode,
  );
  partition.candidateSHA = validateSha(await head(repo));
  await atomicJson(
    path.join(apiRoot, 'test-results/api-e2e/partition.json'),
    partition,
  );
  return partition;
}
const AGENT_TITLES = [
  'proactive organization to strategy run and attributed draft integration dispatches the next minute, records exactly one consumed run and attributes generated drafts',
  ...[
    'runs a native queued graph, requires approval, publishes, and learns its own measured hook in cycle two',
    'converges concurrent dispatch and recovers PENDING transport using the frozen request after restart',
    'accepts a lost enqueue response without counting a failure and never replays a failed slot',
    'refuses a zero budget and preserves archived strategy threads',
    'serializes approval against expiry and never publishes an expired draft',
  ].map((title) => `isolated PostgreSQL/Redis proactive runtime ${title}`),
];
const REQUIRED = {
  'agent-production': [
    'dedicated-preparation',
    'agent-production-migration',
    'agent-production',
  ],
  'brand-acceptance': [
    'dedicated-preparation',
    'brand-acceptance-units',
    'brand-acceptance',
  ],
  'dataset-diagnostic': [
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-diagnostic',
  ],
  'dataset-smoke': [
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-smoke',
  ],
  'dataset-scale': [
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-matrix',
  ],
  final: [
    'learning-runtime',
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-smoke',
    'brand-preparation',
    'brand-migration',
    'brand-units',
    'brand-contracts',
    'brand-serializers',
    'baseline-materialization-migration',
    'storage',
    'crun-image',
    'crun-video',
    'agent-preparation',
    'agent',
    'publisher',
  ],
  'visual-isolation': ['visual-protocol', 'visual-isolation'],
  'visual-connected': [
    'visual-preparation',
    'visual-renderless',
    ...[1, 2, 3, 4, 5].map((index) => `visual-case-${index}`),
    'visual-library',
  ],
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export class AcceptanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new AcceptanceError(code);
}
function exactKeys(value, keys, code) {
  requireThat(
    value && typeof value === 'object' && !Array.isArray(value),
    code,
  );
  requireThat(
    Object.keys(value).sort().join('|') === [...keys].sort().join('|'),
    code,
  );
}
export function validateSha(value) {
  requireThat(SHA.test(value ?? ''), 'INVALID_SHA');
  return value;
}
export function readPostgresCredentials(env) {
  const username = env?.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  const password = env?.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  requireThat(
    typeof username === 'string' &&
      username.length > 0 &&
      typeof password === 'string' &&
      password.length > 0,
    'POSTGRES_CREDENTIALS_REQUIRED',
  );
  requireThat(
    username === 'genfeed' && /^[A-Za-z0-9_-]{12,128}$/.test(password),
    'INVALID_POSTGRES_CREDENTIALS',
  );
  return { username, password };
}
function validateCredentials(credentials) {
  return readPostgresCredentials({
    RUNTIME_ACCEPTANCE_POSTGRES_USER: credentials?.username,
    RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: credentials?.password,
  });
}
export function validateUrl(value, kind, database, credentials) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AcceptanceError('INVALID_SERVICE_URL');
  }
  requireThat(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'NON_LOOPBACK_SERVICE',
  );
  requireThat(
    !url.hash &&
      ![...url.searchParams.keys()].some((key) =>
        /^(?:host|hostaddr|service)$/i.test(key),
      ),
    'SERVICE_OVERRIDE',
  );
  if (kind === 'postgres') {
    validateCredentials(credentials);
    requireThat(
      url.protocol === 'postgresql:' &&
        url.port === '5432' &&
        url.pathname === `/${database}` &&
        database.includes('test'),
      'INVALID_DATABASE',
    );
    requireThat(
      url.username === 'genfeed' &&
        url.password === credentials.password &&
        !url.username.includes('%') &&
        !url.password.includes('%') &&
        !url.search,
      'INVALID_DATABASE',
    );
  } else {
    requireThat(
      url.protocol === 'redis:' &&
        url.port === '6379' &&
        /^\/\d+$/.test(url.pathname) &&
        !url.username &&
        !url.password &&
        !url.search,
      'INVALID_REDIS',
    );
  }
  return url;
}
export function parseArguments(argv) {
  const [command, ...args] = argv;
  requireThat(
    ['preflight', ...GROUPS, 'seal'].includes(command),
    'INVALID_COMMAND',
  );
  const options = { command };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    requireThat(
      [
        '--repo',
        '--state',
        '--candidate-sha',
        '--control-sha',
        ...(command === 'preflight' ? ['--group'] : []),
      ].includes(name),
      'INVALID_ARGUMENT',
    );
    requireThat(
      args[index + 1] && !Object.hasOwn(options, name.slice(2)),
      'INVALID_ARGUMENT',
    );
    options[name.slice(2)] = args[index + 1];
  }
  requireThat(
    path.isAbsolute(options.repo ?? '') && path.isAbsolute(options.state ?? ''),
    'ABSOLUTE_PATH_REQUIRED',
  );
  validateSha(options['candidate-sha']);
  validateSha(options['control-sha']);
  if (command === 'preflight')
    requireThat(GROUPS.includes(options.group), 'INVALID_GROUP');
  return options;
}
export function validateOwnerContract(value) {
  let contract;
  try {
    contract = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new AcceptanceError('OWNER_CONTRACT_REQUIRED');
  }
  exactKeys(
    contract,
    ['version', 'brand', 'storage'],
    'INVALID_OWNER_CONTRACT',
  );
  requireThat(
    contract.version === 1 &&
      Array.isArray(contract.storage) &&
      contract.storage.length === 6,
    'INVALID_OWNER_CONTRACT',
  );
  const seen = new Set();
  const seenTitles = new Set();
  const entries = [contract.brand, ...contract.storage];
  for (const entry of entries) {
    exactKeys(
      entry,
      ['path', 'sha256', 'passedTitles'],
      'INVALID_OWNER_CONTRACT',
    );
    requireThat(
      typeof entry.path === 'string' &&
        !seen.has(entry.path) &&
        HASH.test(entry.sha256 ?? ''),
      'INVALID_OWNER_CONTRACT',
    );
    seen.add(entry.path);
    requireThat(
      Array.isArray(entry.passedTitles) &&
        entry.passedTitles.length > 0 &&
        entry.passedTitles.every(
          (title) =>
            typeof title === 'string' &&
            title.trim() === title &&
            title.length > 0,
        ) &&
        new Set(entry.passedTitles).size === entry.passedTitles.length,
      'INVALID_OWNER_CONTRACT',
    );
    for (const title of entry.passedTitles) {
      requireThat(!seenTitles.has(title), 'DUPLICATE_OWNER_TITLE');
      seenTitles.add(title);
    }
  }
  requireThat(
    contract.brand.path === BRAND_PATH &&
      contract.storage.every((entry) => STORAGE_PATHS.includes(entry.path)),
    'INVALID_OWNER_PATH',
  );
  return contract;
}
export function validateReport(report, contracts, child) {
  requireThat(
    child.exitCode === 0 && !child.signal && !child.timedOut,
    'CHILD_FAILED',
  );
  requireThat(
    report &&
      Array.isArray(report.testResults) &&
      report.testResults.length > 0 &&
      report.success === true,
    'INVALID_REPORT',
  );
  const result = [];
  const matched = new Set();
  for (const file of report.testResults) {
    const contract = contracts.find((entry) =>
      file.name?.replaceAll('\\', '/').endsWith(`/${entry.file}`),
    );
    requireThat(
      contract && !matched.has(contract.file),
      'UNEXPECTED_TEST_FILE',
    );
    matched.add(contract.file);
    requireThat(
      Array.isArray(file.assertionResults) && file.assertionResults.length > 0,
      'EMPTY_REPORT',
    );
    const passed = [];
    const skipped = [];
    for (const assertion of file.assertionResults) {
      requireThat(
        typeof assertion.fullName === 'string' && assertion.fullName.length > 0,
        'INVALID_ASSERTION',
      );
      if (assertion.status === 'passed') passed.push(assertion.fullName);
      else if (['pending', 'skipped'].includes(assertion.status))
        skipped.push(assertion.fullName);
      else throw new AcceptanceError('TEST_NOT_PASSED');
    }
    requireThat(
      new Set([...passed, ...skipped]).size === passed.length + skipped.length,
      'DUPLICATE_TEST',
    );
    requireThat(
      passed.length > 0 &&
        (contract.count == null || passed.length === contract.count),
      'CASE_COUNT_MISMATCH',
    );
    if (contract.titles)
      requireThat(
        [...passed].sort().join('\n') ===
          [...contract.titles].sort().join('\n'),
        'CASE_TITLES_MISMATCH',
      );
    requireThat(
      [...skipped].sort().join('\n') ===
        [...(contract.skipped ?? [])].sort().join('\n'),
      'UNEXPECTED_SKIP',
    );
    result.push({
      file: contract.file,
      passedTitles: passed,
      skippedTitles: skipped,
      passed: passed.length,
      skipped: skipped.length,
    });
  }
  requireThat(matched.size === contracts.length, 'MISSING_TEST_FILE');
  return result;
}
export function parseDatasetRecords(output, mode) {
  requireThat(
    ['diagnostic', 'matrix', 'smoke'].includes(mode),
    'INVALID_DATASET_MODE',
  );
  const records = output.split('\n').flatMap((line) => {
    const start = line.indexOf('{');
    if (start < 0) {
      requireThat(
        !/dataset(?:Benchmark|Diagnostic|Smoke)/.test(line),
        'MALFORMED_DATASET_RECORD',
      );
      return [];
    }
    try {
      const value = JSON.parse(line.slice(start));
      return value &&
        typeof value === 'object' &&
        (Object.hasOwn(value, 'datasetDiagnostic') ||
          Object.hasOwn(value, 'datasetBenchmark') ||
          Object.hasOwn(value, 'datasetSmoke'))
        ? [value]
        : [];
    } catch {
      requireThat(
        !/dataset(?:Benchmark|Diagnostic|Smoke)/.test(line),
        'MALFORMED_DATASET_RECORD',
      );
      return [];
    }
  });
  const expected =
    mode === 'diagnostic'
      ? ['consented:10000:1', 'consented:100000:1']
      : mode === 'smoke'
        ? ['owned:10000:1', 'consented:10000:1', 'mixed:10000:1']
        : [1000, 10000, 100000]
            .flatMap((size) =>
              ['owned', 'consented'].flatMap((kind) =>
                [0, 1, 2, 3].map((run) => `${kind}:${size}:${run}`),
              ),
            )
            .concat('mixed:10000:1');
  requireThat(records.length === expected.length, 'DATASET_RECORD_COUNT');
  const seen = new Set();
  for (const record of records) {
    const identity = `${record.kind}:${record.size}:${record.run}`;
    requireThat(
      expected.includes(identity) && !seen.has(identity),
      'DATASET_COVERAGE',
    );
    seen.add(identity);
    requireThat(
      mode === 'diagnostic'
        ? record.datasetDiagnostic === true &&
            record.datasetBenchmark === false &&
            !record.datasetSmoke &&
            record.samplePurpose === 'diagnostic-only-not-matrix-acceptance'
        : mode === 'smoke'
          ? record.datasetSmoke === true &&
            record.datasetBenchmark === false &&
            !record.datasetDiagnostic &&
            record.samplePurpose === 'deployment-smoke'
          : record.datasetBenchmark === true &&
            !record.datasetSmoke &&
            !record.datasetDiagnostic &&
            record.samplePurpose ===
              (record.run === 0 ? 'matrix-warmup' : 'matrix-measurement'),
      'DATASET_PURPOSE',
    );
    const cap = record.kind === 'owned' ? 30000 : 60000;
    for (const field of [
      'elapsedMs',
      'transactionElapsedMs',
      'queries',
      'candidatePages',
      'graphBatches',
      'secondaryGraphBatches',
      'decisionLockBatches',
      'maxBindParameters',
      'graphNodesMaxPass',
      'graphEdgesMaxPass',
      'selectedRows',
    ])
      requireThat(
        Number.isFinite(record[field]) && record[field] >= 0,
        'DATASET_METRIC',
      );
    const rows = record.size + (record.kind === 'mixed' ? 1 : 0);
    const bound =
      record.kind === 'owned'
        ? 8 + Math.ceil(record.size / 1000)
        : 52 +
          3 * record.candidatePages +
          3 * (record.graphBatches + record.secondaryGraphBatches) +
          3 * record.decisionLockBatches +
          Math.ceil(rows / 1000) +
          Math.ceil((record.size + 10) / 1000);
    requireThat(
      record.elapsedMs <= cap &&
        record.transactionElapsedMs <= cap &&
        record.queries <= bound &&
        record.queries <= (record.kind === 'owned' ? bound : 6000) &&
        record.maxBindParameters <= 32767 &&
        record.selectedRows === rows &&
        record.graphNodesMaxPass ===
          (record.kind === 'owned' ? 0 : 7 * record.size + 36) &&
        record.graphEdgesMaxPass ===
          (record.kind === 'owned' ? 0 : 12 * record.size + 210),
      'DATASET_LIMIT',
    );
  }
  return records;
}
export function validateCrunManifest(manifest, directory) {
  exactKeys(
    manifest,
    ['version', 'schema', 'ownedDirectory', 'redisKeys'],
    'CRUN_OWNERSHIP',
  );
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const keyPattern = new RegExp(
    `^(?:crun:requests:[a-f0-9]{64}|crun:quote:${uuid}:${uuid}:${uuid}(?::consumed)?)$`,
  );
  const videoPrefix = `crun:video:cache:${manifest.schema}:`;
  const videoKeyPattern = new RegExp(
    `^(?:crun:requests:[a-f0-9]{64}|crun:video:quote:${uuid}:${uuid}:${uuid}(?::consumed)?|probe:${uuid}(?::control)?|tag:videos)$`,
  );
  requireThat(
    manifest.version === 1 &&
      manifest.ownedDirectory === directory &&
      (manifest.schema === null ||
        /^crun_flow_[a-f0-9]{32}$/.test(manifest.schema)) &&
      Array.isArray(manifest.redisKeys) &&
      manifest.redisKeys.length <= 1024 &&
      new Set(manifest.redisKeys).size === manifest.redisKeys.length &&
      manifest.redisKeys.every(
        (key) =>
          typeof key === 'string' &&
          (keyPattern.test(key) ||
            (typeof manifest.schema === 'string' &&
              /^crun_flow_[a-f0-9]{32}$/.test(manifest.schema) &&
              key.startsWith(videoPrefix) &&
              videoKeyPattern.test(key.slice(videoPrefix.length)))),
      ),
    'CRUN_OWNERSHIP',
  );
  return manifest;
}
const SECRET_ENV_NAME = /token|secret|password|key/i;
export function secretValues(env = {}) {
  const values = new Set();
  for (const [name, value] of Object.entries(env))
    if (
      SECRET_ENV_NAME.test(name) &&
      typeof value === 'string' &&
      value.length >= 6
    ) {
      values.add(value);
      values.add(JSON.stringify(value).slice(1, -1));
    }
  return [...values].sort((left, right) => right.length - left.length);
}
export function redactText(text, env) {
  let result = String(text);
  for (const value of secretValues(env))
    result = result.split(value).join('[REDACTED]');
  return result;
}
export function redactBytes(bytes, env) {
  if (bytes.includes(0)) return bytes;
  const text = bytes.toString('utf8');
  const redacted = redactText(text, env);
  return redacted === text ? bytes : Buffer.from(redacted);
}
export function buildEvidence(payload, identity, env) {
  const document = {
    version: 1,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    group: identity.group,
    ...payload,
  };
  const serialized = redactText(JSON.stringify(document), env);
  requireThat(
    Buffer.byteLength(serialized) <= RAW_LIMIT * 1.4 + 65536,
    'RAW_LIMIT',
  );
  requireThat(
    Buffer.byteLength(serialized) <= ENVELOPE_LIMIT,
    'ENVELOPE_LIMIT',
  );
  return serialized;
}
async function privateFile(file, bytes) {
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}`;
  await privateFile(temporary, JSON.stringify(value));
  await rename(temporary, file);
}
export async function safeFile(root, relative, max = RAW_LIMIT) {
  requireThat(
    !path.isAbsolute(relative) &&
      relative
        .split('/')
        .every((part) => part && part !== '.' && part !== '..'),
    'UNSAFE_EVIDENCE_PATH',
  );
  const file = path.join(root, relative);
  requireThat(
    (await realpath(path.dirname(file))) === path.dirname(file),
    'UNSAFE_EVIDENCE_FILE',
  );
  const handle = await open(
    file,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    requireThat(
      metadata.isFile() &&
        metadata.size <= max &&
        (metadata.mode & 0o777) === 0o600 &&
        metadata.uid === process.getuid(),
      'UNSAFE_EVIDENCE_FILE',
    );
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
async function verifySource(repo, entry) {
  const file = path.join(repo, entry.path);
  const metadata = await lstat(file);
  requireThat(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (await realpath(file)) === file,
    'UNSAFE_SOURCE',
  );
  requireThat(
    sha256(await readFile(file)) === entry.sha256,
    'SOURCE_HASH_MISMATCH',
  );
}

export const FINAL_DATABASE_NAMES = [
  'genfeed_dataset_5781_test',
  'genfeed_dataset_5781_matrix_test',
  'genfeed_dataset_5781_profile_test',
  'genfeed_4617_ed1f_test',
  'genfeed_crun_test',
  'genfeed_agent_test',
  'genfeed_baseline_materialization_test',
  'genfeed_learning_runtime_test',
  'genfeed_learning_races_test',
];
function validateFinalDatabase(identity, name, postgresId) {
  requireThat(
    identity.group === 'final' &&
      FINAL_DATABASE_NAMES.includes(name) &&
      serviceId(identity.resources.postgres) === postgresId,
    'FINAL_DATABASE_OWNERSHIP',
  );
}
export async function createFinalOwnedDatabase(identity, name, adapters) {
  const postgresId = serviceId(identity.resources.postgres);
  validateFinalDatabase(identity, name, postgresId);
  const url = databaseUrl(name, adapters.credentials);
  validateUrl(url, 'postgres', name, adapters.credentials);
  requireThat(
    (await adapters.absent(name, postgresId)) === '',
    'DATABASE_ALREADY_EXISTS',
  );
  const resource = {
    name,
    postgresId,
    created: false,
    creationIntent: true,
    creationIssued: false,
    intentPersisted: false,
  };
  identity.resources.databases.push(resource);
  await adapters.persist(identity);
  resource.intentPersisted = true;
  resource.creationIssued = true;
  await adapters.create(name, postgresId);
  resource.created = true;
  await adapters.persist(identity);
  return url;
}
// Scoped to one final execution; image and video use the same owned database.
export function createFinalCrunDatabaseAllocator(database) {
  let url;
  return async () => {
    url ??= await database('genfeed_crun_test');
    return url;
  };
}
export async function cleanupFinalOwnedDatabase(
  identity,
  resource,
  adapters,
  deadline,
) {
  if (resource.intentPersisted !== true || resource.creationIssued !== true)
    return { eligible: false };
  validateFinalDatabase(identity, resource.name, resource.postgresId);
  requireThat(Date.now() < deadline, 'CLEANUP_DEADLINE');
  await untilDeadline(
    adapters.drop(resource.name, resource.postgresId, deadline),
    deadline,
    realClock,
    'CLEANUP_DEADLINE',
  );
  requireThat(
    Date.now() < deadline &&
      (await untilDeadline(
        adapters.absent(resource.name, resource.postgresId, deadline),
        deadline,
        realClock,
        'CLEANUP_DEADLINE',
      )) === '',
    'DATABASE_REMOVAL_UNCONFIRMED',
  );
  resource.removed = true;
  requireThat(Date.now() < deadline, 'CLEANUP_DEADLINE');
  try {
    await untilDeadline(
      adapters.persist(identity),
      deadline,
      realClock,
      'CLEANUP_DEADLINE',
    );
  } catch {
    throw new AcceptanceError('FINAL_JOURNAL_WRITE_FAILED');
  }
  return { eligible: true, removed: true };
}
export function hasFinalCrunTerminationProof(
  resource,
  mediaKind = resource?.mediaKind,
) {
  const proof = resource?.terminationProof;
  return (
    ['image', 'video'].includes(mediaKind) &&
    resource?.mediaKind === mediaKind &&
    resource?.terminationProof?.mediaKind === mediaKind &&
    Number.isSafeInteger(resource.pgid) &&
    resource.pgid > 1 &&
    resource.spawnIssued === true &&
    resource.streamsClosed === true &&
    resource.terminationConfirmed === true &&
    resource.terminationProofPersisted === true &&
    proof?.pgid === resource.pgid &&
    proof.uuid === resource.uuid &&
    proof.candidateSHA === resource.candidateSHA &&
    proof.controlSHA === resource.controlSHA &&
    SHA.test(proof.candidateSHA ?? '') &&
    SHA.test(proof.controlSHA ?? '') &&
    proof.groupAbsent === true &&
    proof.childClosed === true &&
    proof.streamsClosed === true &&
    Number.isSafeInteger(proof.checkedAt) &&
    proof.checkedAt <= proof.deadline
  );
}
export function selectFinalCrunCleanupResult(
  identity,
  commands,
  completed,
  mediaKind,
) {
  const stage = `crun-${mediaKind}`;
  const resource = identity.resources.crun?.[mediaKind];
  if (
    resource == null &&
    !commands.some((entry) => entry.stage === stage) &&
    !completed.some((entry) => entry.stage === stage)
  )
    return null;
  const result = resource?.cleanupResult ?? {
    passed: false,
    operations: [{ name: 'termination-proof', passed: false }],
    failures: [
      {
        stage: `crun-${mediaKind}-cleanup`,
        code: 'CRUN_TERMINATION_UNCONFIRMED',
      },
    ],
  };
  if (
    result.passed &&
    (resource.candidateSHA !== identity.candidateSHA ||
      resource.controlSHA !== identity.controlSHA ||
      !hasFinalCrunTerminationProof(resource, mediaKind))
  ) {
    result.passed = false;
    result.failures.push({
      stage: `crun-${mediaKind}-cleanup`,
      code: 'CRUN_TERMINATION_PROOF_FAILED',
    });
  }
  return result;
}
export async function runFinalCrunBounded({
  identity,
  mediaKind,
  resource,
  executable,
  args,
  cwd,
  env,
  stdoutPath,
  stderrPath,
  persistProof,
  cleanupOwned,
  clock = realClock,
  start = startVisualProcess,
  stop = stopVisualGroups,
  probe = (pid) => process.kill(-pid, 0),
  isCancelled = () => cancelled,
  aggregateDeadline = identity.overallDeadline,
}) {
  requireThat(
    ['image', 'video'].includes(mediaKind) &&
      identity.group === 'final' &&
      identity.resources.crun?.[mediaKind] === resource &&
      resource?.mediaKind === mediaKind &&
      (!resource.candidateSHA ||
        resource.candidateSHA === identity.candidateSHA) &&
      (!resource.controlSHA || resource.controlSHA === identity.controlSHA),
    'CRUN_OWNERSHIP',
  );
  exactKeys(identity.resources.crun, ['image', 'video'], 'CRUN_OWNERSHIP');
  const other =
    identity.resources.crun[mediaKind === 'image' ? 'video' : 'image'];
  requireThat(
    !other ||
      (other !== resource &&
        other.uuid !== resource.uuid &&
        other.manifest !== resource.manifest &&
        other.directory !== resource.directory),
    'CRUN_OWNERSHIP',
  );
  const started = clock.now(),
    workEnd = Math.min(started + 60000, aggregateDeadline - 15000);
  requireThat(workEnd === started + 60000, 'AGGREGATE_DEADLINE');
  Object.assign(resource, {
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    terminationConfirmed: false,
    streamsClosed: false,
    terminationProofPersisted: false,
    spawnIssued: false,
    pgid: null,
    terminationProof: undefined,
    cleanupResult: undefined,
  });
  const result = {
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimit: false,
    spawnError: null,
    streamError: null,
    cleanupError: null,
  };
  let handle, observed, firstError;
  let spawnWindowOpen = true;
  try {
    requireThat(!isCancelled(), 'CANCELLED');
    const pending = start({
      executable,
      args,
      cwd,
      env,
      stdoutPath,
      stderrPath,
      beforeSpawn: () => {
        requireThat(!isCancelled(), 'CANCELLED');
        requireThat(
          spawnWindowOpen && clock.now() < workEnd,
          'CRUN_WORK_TIMEOUT',
        );
      },
      onSpawn: (pid) => {
        resource.pgid = pid;
        resource.spawnIssued = Number.isSafeInteger(pid) && pid > 1;
      },
    });
    pending.then(
      (value) => {
        handle = value;
        value.done.then((status) => {
          observed = status;
        });
      },
      () => {},
    );
    handle = await untilDeadline(pending, workEnd, clock, 'CRUN_WORK_TIMEOUT');
    requireThat(
      resource.spawnIssued && handle.pid === resource.pgid,
      'CRUN_PROCESS_OWNERSHIP',
    );
    await untilDeadline(
      persistProof(identity, resource),
      workEnd,
      clock,
      'CRUN_JOURNAL_WRITE_FAILED',
    );
    observed = await untilDeadline(
      handle.done,
      workEnd,
      clock,
      'CRUN_WORK_TIMEOUT',
    );
    requireThat(!isCancelled(), 'CANCELLED');
  } catch (error) {
    firstError = error.code ?? 'CRUN_CONTROL_FAILED';
    if (firstError === 'CRUN_WORK_TIMEOUT') result.timedOut = true;
    else result.spawnError = firstError;
  } finally {
    spawnWindowOpen = false;
  }
  const cleanupStarted = clock.now(),
    cleanupEnd = Math.min(
      cleanupStarted + 15000,
      started + 75000,
      aggregateDeadline,
    ),
    terminationEnd = Math.min(cleanupStarted + 10000, cleanupEnd - 5000);
  try {
    requireThat(
      resource.spawnIssued &&
        Number.isSafeInteger(resource.pgid) &&
        resource.pgid > 1,
      'CRUN_PROCESS_OWNERSHIP',
    );
    await untilDeadline(
      stop([resource.pgid], {
        term: 5000,
        kill: 3000,
        deadline: terminationEnd,
      }),
      terminationEnd,
      clock,
      'CRUN_TERMINATION_UNCONFIRMED',
    );
    requireThat(
      handle && handle.pid === resource.pgid,
      'CRUN_PROCESS_OWNERSHIP',
    );
    observed = await untilDeadline(
      handle.done,
      terminationEnd,
      clock,
      'CRUN_STREAMS_UNCONFIRMED',
    );
    resource.streamsClosed = true;
    let absent = false;
    try {
      probe(resource.pgid);
    } catch (error) {
      if (error.code === 'ESRCH') absent = true;
      else throw error;
    }
    requireThat(absent, 'CRUN_TERMINATION_UNCONFIRMED');
    resource.terminationProof = {
      mediaKind,
      pgid: resource.pgid,
      uuid: resource.uuid,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      groupAbsent: true,
      childClosed: true,
      streamsClosed: true,
      checkedAt: clock.now(),
      deadline: terminationEnd,
    };
    resource.terminationConfirmed = true;
    try {
      await untilDeadline(
        persistProof(identity, resource),
        terminationEnd,
        clock,
        'CRUN_TERMINATION_PROOF_FAILED',
      );
      requireThat(
        clock.now() < terminationEnd,
        'CRUN_TERMINATION_PROOF_FAILED',
      );
      resource.terminationProofPersisted = true;
    } catch {
      resource.terminationConfirmed = false;
      resource.terminationProofPersisted = false;
      throw new AcceptanceError('CRUN_TERMINATION_PROOF_FAILED');
    }
    const ownedEnd = Math.min(cleanupEnd, clock.now() + 5000);
    resource.cleanupResult = await untilDeadline(
      cleanupOwned(ownedEnd),
      ownedEnd,
      clock,
      'CRUN_CLEANUP_DEADLINE',
    );
    requireThat(
      resource.cleanupResult?.passed === true,
      'CRUN_RESOURCE_CLEANUP_FAILED',
    );
  } catch (error) {
    result.cleanupError = error.code ?? 'CRUN_TERMINATION_UNCONFIRMED';
    if (!resource.cleanupResult)
      resource.cleanupResult = {
        passed: false,
        operations: [{ name: 'termination-proof', passed: false }],
        failures: [
          { stage: `crun-${mediaKind}-cleanup`, code: result.cleanupError },
        ],
      };
  }
  if (observed)
    Object.assign(result, {
      exitCode: observed.exitCode,
      signal: observed.signal,
      outputLimit: observed.outputLimit ?? false,
      streamError: observed.streamError ? 'STREAM_FAILED' : null,
    });
  return {
    ...result,
    workError: firstError,
    elapsedMs: clock.now() - started,
    terminationProof: resource.terminationProof,
    cleanupDeadline: cleanupEnd,
  };
}
export function hasFinalLearningTerminationProof(resource) {
  const proof = resource?.terminationProof;
  return (
    resource?.spawnIssued === true &&
    resource.streamsClosed === true &&
    resource.terminationConfirmed === true &&
    resource.terminationProofPersisted === true &&
    Number.isSafeInteger(resource.pgid) &&
    resource.pgid > 1 &&
    proof?.pgid === resource.pgid &&
    proof.ownerNonce === resource.receipt?.ownerNonce &&
    proof.receiptHash === resource.receiptHash &&
    proof.candidateSHA === resource.candidateSHA &&
    proof.controlSHA === resource.controlSHA &&
    proof.groupAbsent === true &&
    proof.childClosed === true &&
    proof.streamsClosed === true &&
    Number.isSafeInteger(proof.checkedAt) &&
    proof.checkedAt <= proof.deadline
  );
}

export async function runFinalLearningBounded({
  identity,
  resource,
  executable,
  args,
  cwd,
  env,
  stdoutPath,
  stderrPath,
  persistProof,
  cleanupOwned,
  clock = realClock,
  start = startVisualProcess,
  stop = stopVisualGroups,
  probe = (pid) => process.kill(-pid, 0),
  isCancelled = () => cancelled,
  aggregateDeadline = identity.overallDeadline,
}) {
  requireThat(
    identity.group === 'final' &&
      identity.resources.learning === resource &&
      resource?.receipt?.candidateSHA === identity.candidateSHA &&
      resource.receipt.containerId === identity.resources.redis,
    'LEARNING_OWNERSHIP',
  );
  const started = resource.startedAt,
    workEnd = started + FINAL_LEARNING_BUDGET.work;
  requireThat(
    Number.isSafeInteger(started) &&
      clock.now() < workEnd &&
      started + FINAL_LEARNING_BUDGET.total <= aggregateDeadline,
    'AGGREGATE_DEADLINE',
  );
  Object.assign(resource, {
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    terminationConfirmed: false,
    streamsClosed: false,
    terminationProofPersisted: false,
    spawnIssued: false,
    pgid: null,
    terminationProof: undefined,
    cleanupResult: undefined,
  });
  const result = {
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimit: false,
    spawnError: null,
    streamError: null,
    cleanupError: null,
  };
  let handle, observed, firstError;
  let spawnWindowOpen = true;
  try {
    requireThat(!isCancelled(), 'CANCELLED');
    const pending = start({
      executable,
      args,
      cwd,
      env,
      stdoutPath,
      stderrPath,
      beforeSpawn: () => {
        requireThat(!isCancelled(), 'CANCELLED');
        requireThat(
          spawnWindowOpen && clock.now() < workEnd,
          'LEARNING_WORK_TIMEOUT',
        );
      },
      onSpawn: (pid) => {
        resource.pgid = pid;
        resource.spawnIssued = Number.isSafeInteger(pid) && pid > 1;
      },
    });
    pending.then(
      (value) => {
        handle = value;
        value.done.then((status) => {
          observed = status;
        });
      },
      () => {},
    );
    handle = await untilDeadline(
      pending,
      workEnd,
      clock,
      'LEARNING_WORK_TIMEOUT',
    );
    requireThat(
      resource.spawnIssued && handle.pid === resource.pgid,
      'LEARNING_PROCESS_OWNERSHIP',
    );
    await untilDeadline(
      persistProof(identity, resource),
      workEnd,
      clock,
      'LEARNING_JOURNAL_WRITE_FAILED',
    );
    observed = await untilDeadline(
      handle.done,
      workEnd,
      clock,
      'LEARNING_WORK_TIMEOUT',
    );
    requireThat(!isCancelled(), 'CANCELLED');
  } catch (error) {
    firstError = error.code ?? 'LEARNING_CONTROL_FAILED';
    if (firstError === 'LEARNING_WORK_TIMEOUT') result.timedOut = true;
    else result.spawnError = firstError;
  } finally {
    spawnWindowOpen = false;
  }
  const cleanupStarted = clock.now(),
    cleanupEnd = Math.min(
      cleanupStarted + FINAL_LEARNING_BUDGET.cleanup,
      started + FINAL_LEARNING_BUDGET.total,
      aggregateDeadline,
    ),
    terminationEnd = Math.min(cleanupStarted + 10000, cleanupEnd - 45000);
  try {
    requireThat(
      resource.spawnIssued &&
        Number.isSafeInteger(resource.pgid) &&
        resource.pgid > 1,
      'LEARNING_PROCESS_OWNERSHIP',
    );
    await untilDeadline(
      stop([resource.pgid], {
        term: 5000,
        kill: 3000,
        deadline: terminationEnd,
      }),
      terminationEnd,
      clock,
      'LEARNING_TERMINATION_UNCONFIRMED',
    );
    requireThat(
      handle && handle.pid === resource.pgid,
      'LEARNING_PROCESS_OWNERSHIP',
    );
    observed = await untilDeadline(
      handle.done,
      terminationEnd,
      clock,
      'LEARNING_STREAMS_UNCONFIRMED',
    );
    resource.streamsClosed = true;
    let absent = false;
    try {
      probe(resource.pgid);
    } catch (error) {
      if (error.code === 'ESRCH') absent = true;
      else throw error;
    }
    requireThat(absent, 'LEARNING_TERMINATION_UNCONFIRMED');
    resource.terminationProof = {
      pgid: resource.pgid,
      ownerNonce: resource.receipt.ownerNonce,
      receiptHash: resource.receiptHash,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      groupAbsent: true,
      childClosed: true,
      streamsClosed: true,
      checkedAt: clock.now(),
      deadline: terminationEnd,
    };
    resource.terminationConfirmed = true;
    try {
      await untilDeadline(
        persistProof(identity, resource),
        terminationEnd,
        clock,
        'LEARNING_TERMINATION_PROOF_FAILED',
      );
      requireThat(
        clock.now() < terminationEnd,
        'LEARNING_TERMINATION_PROOF_FAILED',
      );
      resource.terminationProofPersisted = true;
    } catch {
      resource.terminationConfirmed = false;
      resource.terminationProofPersisted = false;
      throw new AcceptanceError('LEARNING_TERMINATION_PROOF_FAILED');
    }
    const ownedEnd = Math.min(cleanupEnd, clock.now() + 45000);
    resource.cleanupResult = await untilDeadline(
      cleanupOwned(ownedEnd),
      ownedEnd,
      clock,
      'LEARNING_CLEANUP_DEADLINE',
    );
    requireThat(
      resource.cleanupResult?.passed === true,
      'LEARNING_RESOURCE_CLEANUP_FAILED',
    );
  } catch (error) {
    result.cleanupError = error.code ?? 'LEARNING_TERMINATION_UNCONFIRMED';
    if (!resource.cleanupResult)
      resource.cleanupResult = {
        passed: false,
        operations: [{ name: 'termination-proof', passed: false }],
        failures: [
          { stage: 'learning-runtime-cleanup', code: result.cleanupError },
        ],
      };
  }
  if (observed)
    Object.assign(result, {
      exitCode: observed.exitCode,
      signal: observed.signal,
      outputLimit: observed.outputLimit ?? false,
      streamError: observed.streamError ? 'STREAM_FAILED' : null,
    });
  return {
    ...result,
    workError: firstError,
    elapsedMs: clock.now() - started,
    terminationProof: resource.terminationProof,
    cleanupDeadline: cleanupEnd,
  };
}

export async function cleanupFinalCrunResources(resource, adapters, deadline) {
  const result = { passed: true, operations: [], failures: [] };
  const attempt = async (name, code, work) => {
    try {
      requireThat(Date.now() < deadline, 'CLEANUP_DEADLINE');
      await untilDeadline(work(), deadline, realClock, 'CLEANUP_DEADLINE');
      result.operations.push({ name, passed: true });
    } catch (error) {
      result.passed = false;
      result.operations.push({ name, passed: false });
      result.failures.push({
        stage: name,
        code: error.code === 'CLEANUP_DEADLINE' ? error.code : code,
      });
    }
  };
  let manifest, stable;
  await attempt('ownership', 'CRUN_OWNERSHIP', async () => {
    requireThat(
      hasFinalCrunTerminationProof(resource) &&
        /^[a-f0-9-]{36}$/.test(resource.uuid) &&
        resource.manifest === `/tmp/crun-run-${resource.uuid}.json` &&
        resource.directory === `/tmp/crun-owned-${resource.uuid}`,
      'CRUN_OWNERSHIP',
    );
    const descriptor = await open(
      resource.manifest,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      stable = await descriptor.stat();
      requireThat(
        stable.isFile() &&
          stable.dev === resource.manifestMetadata.device &&
          stable.uid === process.getuid() &&
          (stable.mode & 0o777) === 0o600 &&
          stable.size <= 65536 &&
          (await realpath(resource.manifest)) ===
            resource.manifestMetadata.realpath &&
          (await realpath(path.dirname(resource.manifest))) === '/tmp',
        'CRUN_OWNERSHIP',
      );
      manifest = validateCrunManifest(
        JSON.parse(await descriptor.readFile('utf8')),
        resource.directory,
      );
      const current = await lstat(resource.manifest);
      requireThat(
        current.dev === stable.dev &&
          current.ino === stable.ino &&
          current.size === stable.size &&
          current.mtimeMs === stable.mtimeMs,
        'CRUN_OWNERSHIP',
      );
    } finally {
      await descriptor.close();
    }
  });
  if (!result.passed) return result;
  await attempt('evidence', 'CRUN_EVIDENCE_WRITE_FAILED', () =>
    adapters.save(manifest),
  );
  if (manifest.schema)
    await attempt('schema', 'CRUN_SCHEMA_REMOVAL_FAILED', async () => {
      await adapters.dropSchema(manifest.schema, deadline);
      requireThat(
        (await adapters.schemaAbsent(manifest.schema, deadline)) === '',
        'CRUN_SCHEMA_REMOVAL_FAILED',
      );
    });
  if (manifest.redisKeys.length)
    await attempt('redis', 'CRUN_REDIS_REMOVAL_FAILED', async () => {
      await adapters.deleteKeys(manifest.redisKeys, deadline);
      requireThat(
        (await adapters.keysAbsent(manifest.redisKeys, deadline)) === '0',
        'CRUN_REDIS_REMOVAL_FAILED',
      );
    });
  const absent = async (file) => {
    try {
      await lstat(file);
      throw new AcceptanceError('CRUN_OWNERSHIP');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  await attempt('directory', 'CRUN_OWNERSHIP', async () => {
    try {
      const current = await lstat(resource.directory),
        owned = resource.directoryMetadata;
      requireThat(
        current.isDirectory() &&
          !current.isSymbolicLink() &&
          current.uid === process.getuid() &&
          (current.mode & 0o777) === 0o700 &&
          current.dev === owned.device &&
          current.ino === owned.inode &&
          (await realpath(resource.directory)) === owned.realpath,
        'CRUN_OWNERSHIP',
      );
      await rm(resource.directory, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await absent(resource.directory);
  });
  await attempt('manifest', 'CRUN_OWNERSHIP', async () => {
    const current = await lstat(resource.manifest);
    requireThat(
      current.isFile() &&
        !current.isSymbolicLink() &&
        current.uid === process.getuid() &&
        (current.mode & 0o777) === 0o600 &&
        current.dev === stable.dev &&
        current.ino === stable.ino &&
        current.size === stable.size &&
        current.mtimeMs === stable.mtimeMs &&
        (await realpath(resource.manifest)) ===
          resource.manifestMetadata.realpath,
      'CRUN_OWNERSHIP',
    );
    await rm(resource.manifest);
    await absent(resource.manifest);
  });
  await attempt('temporary', 'CRUN_OWNERSHIP', async () => {
    const temporary = `${resource.manifest}.tmp`;
    try {
      const current = await lstat(temporary);
      requireThat(
        current.isFile() &&
          !current.isSymbolicLink() &&
          current.uid === process.getuid() &&
          (current.mode & 0o777) === 0o600 &&
          (await realpath(temporary)) === temporary,
        'CRUN_OWNERSHIP',
      );
      await rm(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await absent(temporary);
  });
  return result;
}

const activeGroups = new Set();
let cancelled = false;
export async function runBounded({
  executable,
  args,
  cwd,
  env,
  stdoutPath,
  stderrPath,
  timeoutMs,
  graceMs = 10000,
  cleanup = async () => {},
}) {
  requireThat(
    timeoutMs > 0 && Number.isFinite(timeoutMs) && graceMs >= 0,
    'INVALID_BUDGET',
  );
  const started = Date.now();
  let child;
  let streams = [];
  const flows = [];
  let timer;
  let grace;
  let closed;
  const result = {
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimit: false,
    spawnError: null,
    streamError: null,
    cleanupError: null,
  };
  const kill = (signal) => {
    if (child?.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') result.spawnError ??= 'TERMINATION_FAILED';
      }
    }
  };
  const terminate = () => {
    kill('SIGTERM');
    if (!grace) grace = setTimeout(() => kill('SIGKILL'), graceMs);
  };
  try {
    await privateFile(stdoutPath, '');
    await privateFile(stderrPath, '');
    streams = [stdoutPath, stderrPath].map((file) =>
      createWriteStream(file, { flags: 'a', mode: 0o600 }),
    );
    for (const stream of streams)
      stream.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
    child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeGroups.add(child.pid);
    closed = new Promise((resolve) => {
      child.once('error', () => {
        result.spawnError = 'SPAWN_FAILED';
      });
      child.once('close', (exitCode, signal) => {
        result.exitCode = exitCode;
        result.signal = signal;
        resolve();
      });
    });
    let bytes = 0;
    for (const [stream, target] of [
      [child.stdout, streams[0]],
      [child.stderr, streams[1]],
    ]) {
      stream.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          const retained = Math.min(
            chunk.length,
            Math.max(0, RAW_LIMIT - bytes),
          );
          bytes += retained;
          if (retained) this.push(chunk.subarray(0, retained));
          if (retained < chunk.length && !result.outputLimit) {
            result.outputLimit = true;
            terminate();
          }
          callback();
        },
      });
      limiter.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
      // The shared Transform budget retains a bounded failed prefix and drains
      // remaining bytes during termination without writing them to disk.
      flows.push(
        pipeline(stream, limiter, target).catch(() => {
          result.streamError = 'STREAM_FAILED';
          terminate();
        }),
      );
    }
    timer = setTimeout(() => {
      result.timedOut = true;
      terminate();
    }, timeoutMs);
    await closed;
  } catch {
    result.spawnError ??= 'CHILD_CONTROL_FAILED';
  } finally {
    kill('SIGKILL');
    if (closed) await closed;
    clearTimeout(timer);
    clearTimeout(grace);
    await Promise.all(flows);
    for (const stream of flows.length ? [] : streams) {
      if (!stream.closed && !stream.writableFinished)
        await new Promise((resolve) => {
          stream.once('error', resolve);
          stream.once('finish', resolve);
          stream.end();
        });
    }
    activeGroups.delete(child?.pid);
    try {
      await cleanup();
    } catch (error) {
      result.cleanupError = error.code ?? 'CLEANUP_FAILED';
    }
  }
  return { ...result, elapsedMs: Date.now() - started };
}
export function privateVitestReporterArguments(reportPath) {
  return [
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportPath}`,
  ];
}
export async function verifyVisualRuntimeProbe(capture, cwd, env, imageId) {
  const available = await capture(
    'docker',
    [
      'info',
      '--format',
      '{{if index .Runtimes "runsc"}}true{{else}}false{{end}}',
    ],
    cwd,
    env,
  );
  requireThat(
    available === 'true' && /^sha256:[a-f0-9]{64}$/.test(imageId),
    'VISUAL_RUNTIME_PREREQUISITE',
  );
}
async function captureCommand(executable, args, cwd, env, timeoutMs = 15000) {
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeGroups.add(child.pid);
  let output = '';
  let size = 0;
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }, timeoutMs);
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      size += data.length;
      if (size <= 16384) output += data;
      else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
    });
    child.stderr.resume();
    child.once('error', () =>
      reject(new AcceptanceError('PREPARATION_FAILED')),
    );
    child.once('close', (code) => {
      activeGroups.delete(child.pid);
      clearTimeout(timer);
      if (code !== 0 || size > 16384)
        reject(new AcceptanceError('PREPARATION_FAILED'));
      else resolve(output.trim());
    });
  });
}
async function head(repo) {
  return captureCommand('git', ['rev-parse', 'HEAD'], repo, process.env);
}
export function validateTiming(group, value, now = Date.now()) {
  const startedAt = Number(value);
  const wall = {
    final: 3600000,
    'dataset-diagnostic': 1200000,
    'dataset-scale': 2400000,
    'dataset-smoke': 1200000,
    'visual-isolation': 1500000,
    'visual-connected': 6300000,
    'agent-production': 1200000,
    'brand-acceptance': 1800000,
  }[group];
  requireThat(
    Number.isSafeInteger(startedAt) &&
      startedAt > 0 &&
      startedAt <= now &&
      wall &&
      now < startedAt + wall,
    'INVALID_JOB_TIMESTAMP',
  );
  return {
    startedAt,
    overallDeadline: startedAt + wall,
    setupDeadline:
      startedAt +
      (['agent-production', 'brand-acceptance'].includes(group)
        ? 300000
        : group === 'visual-connected'
          ? 720000
          : group === 'visual-isolation'
            ? 300000
            : wall - 120000),
  };
}
export function workBudget(identity, now = Date.now()) {
  const reserve =
    identity.group === 'visual-connected'
      ? 300000
      : identity.group === 'brand-acceptance'
        ? 180000
        : 120000;
  requireThat(
    Number.isSafeInteger(identity.overallDeadline) &&
      identity.overallDeadline - reserve > now,
    'AGGREGATE_DEADLINE',
  );
  return identity.overallDeadline - reserve;
}
export async function createState(options, env) {
  readPostgresCredentials(env);
  const timing = validateTiming(
    options.group,
    env.RUNTIME_ACCEPTANCE_JOB_STARTED_MS,
  );
  requireThat(
    process.platform === 'linux' && /^v24\./.test(process.version),
    'HOST_PREREQUISITE',
  );
  const repo = await realpath(options.repo);
  const parent = await realpath(path.dirname(options.state));
  const runnerTemp = await realpath(env.RUNNER_TEMP ?? '');
  requireThat(
    parent === runnerTemp || parent.startsWith(`${runnerTemp}/`),
    'STATE_OUTSIDE_RUNNER_TEMP',
  );
  requireThat(
    parent === path.dirname(options.state) && repo === options.repo,
    'UNSAFE_STATE_PATH',
  );
  const candidateSHA = options['candidate-sha'];
  const controlSHA = options['control-sha'];
  requireThat(
    (await head(repo)) ===
      (['dataset-diagnostic', 'dataset-smoke', 'dataset-scale'].includes(
        options.group,
      )
        ? controlSHA
        : candidateSHA),
    'CHECKOUT_MISMATCH',
  );
  if (['agent-production', 'brand-acceptance'].includes(options.group))
    await verifyDedicatedSources(repo, options.group, env);
  if (options.group === 'final') {
    learningCiIdentity(env);
    await verifyFrozenSources(
      repo,
      requireLearningSourceContract().sourceInputs,
    );
    await verifyBaselineSources(repo);
    const contract = validateOwnerContract(ownerContractFrom(env));
    for (const entry of [contract.brand, ...contract.storage])
      await verifySource(repo, entry);
  }
  await mkdir(options.state, { mode: 0o700 });
  await chmod(options.state, 0o700);
  const metadata = await lstat(options.state);
  const identity = {
    version: 1,
    state: options.state,
    repo,
    candidateSHA,
    controlSHA,
    group: options.group,
    phase: 'prepared',
    ...(options.group === 'final'
      ? { learningCi: learningCiIdentity(env) }
      : {}),
    ...timing,
    device: metadata.dev,
    inode: metadata.ino,
    evidence: [],
    resources: { databases: [], containers: [] },
  };
  await privateFile(
    path.join(options.state, 'identity.json'),
    JSON.stringify(identity),
  );
  await mkdir(path.join(options.state, 'raw'), { mode: 0o700 });
  return identity;
}
export async function loadState(options) {
  const metadata = await lstat(options.state);
  requireThat(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o777) === 0o700 &&
      (await realpath(options.state)) === options.state,
    'UNSAFE_STATE',
  );
  const identity = JSON.parse(
    await safeFile(options.state, 'identity.json', 65536),
  );
  const expectedTiming = validateTiming(
    identity.group,
    identity.startedAt,
    identity.startedAt,
  );
  requireThat(
    identity.overallDeadline === expectedTiming.overallDeadline &&
      identity.setupDeadline === expectedTiming.setupDeadline,
    'STATE_DEADLINE_MISMATCH',
  );
  requireThat(
    identity.version === 1 &&
      identity.state === options.state &&
      identity.repo === (await realpath(options.repo)) &&
      identity.candidateSHA === options['candidate-sha'] &&
      identity.controlSHA === options['control-sha'] &&
      identity.device === metadata.dev &&
      identity.inode === metadata.ino &&
      GROUPS.includes(identity.group),
    'STATE_IDENTITY_MISMATCH',
  );
  return identity;
}
async function diskGuard(repo) {
  const disk = await statfs(repo);
  requireThat(
    Number(disk.bavail) * Number(disk.bsize) >= 10 * 1024 ** 3,
    'DISK_PREREQUISITE',
  );
}
function serviceId(value) {
  requireThat(/^[a-f0-9]{12,64}$/.test(value ?? ''), 'SERVICE_ID_REQUIRED');
  return value;
}
export function databaseUrl(name, credentials) {
  validateCredentials(credentials);
  const url = new URL('postgresql://127.0.0.1:5432');
  url.username = credentials.username;
  url.password = credentials.password;
  url.pathname = `/${name}`;
  return url.href;
}
export function postgresClientInvocation(containerId, psqlArgs, credentials) {
  validateCredentials(credentials);
  return {
    args: [
      'exec',
      '--env',
      'PGPASSWORD',
      serviceId(containerId),
      'psql',
      '-U',
      'genfeed',
      ...psqlArgs,
    ],
    env: { PGPASSWORD: credentials.password },
  };
}
async function persistIdentity(identity) {
  await atomicJson(path.join(identity.state, 'identity.json'), identity);
}
const VISUAL_SPEC =
  'test/integration/visual-code/visual-code-local-runtime.integration.spec.ts';
const VISUAL_SUITE =
  'visual-code local-runtime acceptance (explicit owned DB/Redis and Linux runsc prerequisites)';
export const VISUAL_CASES = [
  ['hybrid exports and immutable revisions', 'hybrid-success'],
  ['compile recovery preserves bounded receipts', 'compile-recovery'],
  ['visual rejection stops after two repairs', 'visual-rejection'],
  ['budget and asset scope refuse work', 'hybrid-success'],
  ['cancelled rendering settles once', 'hybrid-success'],
].map(([title, scenario], index) => ({
  index: index + 1,
  title: `${VISUAL_SUITE} ${title}`,
  scenario,
}));
export const VISUAL_RENDERLESS_TITLES = [
  'continues after synchronous failure at step 0',
  'continues after synchronous failure at step 1',
  'continues after asynchronous failure at step 0',
  'continues after asynchronous failure at step 1',
  'collects resource and restoration failures while attempting every later step',
  'fulfills after all successful steps',
].map(
  (title) => `visual-code cleanup rejection isolation (renderless) ${title}`,
);
const VISUAL_ALL_TITLES = [
  ...VISUAL_RENDERLESS_TITLES,
  ...VISUAL_CASES.map((item) => item.title),
];
export function visualSelection(index) {
  const selected =
    index === 0
      ? VISUAL_RENDERLESS_TITLES
      : [VISUAL_CASES.find((item) => item.index === index)?.title];
  requireThat(selected.every(Boolean), 'INVALID_VISUAL_CASE');
  const suite =
    index === 0
      ? 'visual-code cleanup rejection isolation (renderless)'
      : VISUAL_SUITE;
  const taskNames = selected.map(
    (title) => `${suite} > ${title.slice(suite.length + 1)}`,
  );
  return {
    file: VISUAL_SPEC,
    count: selected.length,
    titles: selected,
    skipped: VISUAL_ALL_TITLES.filter((title) => !selected.includes(title)),
    pattern: `^(?:${taskNames.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
  };
}
export function validateVisualSelection(report, index, child) {
  const selection = visualSelection(index);
  for (const file of report?.testResults ?? [])
    for (const assertion of file.assertionResults ?? [])
      if (selection.skipped.includes(assertion.fullName))
        requireThat(
          assertion.status === 'pending' || assertion.status === 'skipped',
          'INVALID_SELECTION_EXCLUSION',
        );
  return validateReport(report, [selection], child);
}
export function parseProtocolTotals(output, child) {
  requireThat(
    child.exitCode === 0 &&
      !child.signal &&
      !child.timedOut &&
      !child.outputLimit &&
      !child.streamError,
    'CHILD_FAILED',
  );
  const totals = {};
  for (const line of output.split('\n')) {
    if (!/^# (?:tests|pass|fail|cancelled|skipped|todo)\b/.test(line)) continue;
    const match = line.match(
      /^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$/,
    );
    requireThat(
      match && !Object.hasOwn(totals, match[1]),
      'INVALID_PROTOCOL_TOTALS',
    );
    const count = Number(match[2]);
    requireThat(
      Number.isSafeInteger(count) && count >= 0,
      'INVALID_PROTOCOL_TOTALS',
    );
    totals[match[1]] = count;
  }
  requireThat(
    ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every((key) =>
      Object.hasOwn(totals, key),
    ) &&
      totals.tests === totals.pass &&
      totals.pass > 0 &&
      ['fail', 'cancelled', 'skipped', 'todo'].every(
        (key) => totals[key] === 0,
      ),
    'INVALID_PROTOCOL_TOTALS',
  );
  return totals;
}
export function rendererContainerNames(entries) {
  const names = [];
  for (const { filename, receipt } of entries) {
    requireThat(
      receipt &&
        typeof receipt.id === 'string' &&
        receipt.id.length > 0 &&
        receipt.id.length <= 4096,
      'RENDERER_OWNERSHIP',
    );
    const name = `visual-code-${sha256(receipt.id).slice(0, 40)}`;
    requireThat(
      filename === `${name}.json` && !names.includes(name),
      'RENDERER_OWNERSHIP',
    );
    names.push(name);
  }
  return names;
}
export function validateVisualScenarioEvidence(evidence, caseInfo) {
  const fail = (condition) =>
    requireThat(condition, 'INVALID_VISUAL_SCENARIO_EVIDENCE');
  fail(
    VISUAL_CASES.some(
      (item) =>
        item.index === caseInfo.index &&
        item.title === caseInfo.title &&
        item.scenario === caseInfo.scenario,
    ),
  );
  fail(evidence?.outcome === 'passed');
  for (const field of [
    'revisions',
    'rendererSubmissions',
    'rendererReceipts',
    'reservations',
    'transactions',
    'wallets',
    'assertions',
  ])
    fail(Array.isArray(evidence[field]));
  const safeId = (id) =>
    typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
  const finite = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const unique = (rows) => {
    fail(rows.every((row) => row && safeId(row.id)));
    fail(new Set(rows.map((row) => row.id)).size === rows.length);
  };
  for (const field of [
    'revisions',
    'rendererSubmissions',
    'reservations',
    'transactions',
  ])
    unique(evidence[field]);
  fail(evidence.assertions.every((value) => typeof value === 'string'));
  const markers = [
    [
      'create-replay',
      'broker-redelivery',
      'immutable-revisions',
      'stale-concurrency',
    ],
    ['real-compile-failure', 'one-applied-repair'],
    ['two-repair-limit', 'no-output-admission'],
    ['quote-minus-cent-denied', 'tenant-and-brand-denied'],
    ['running-render-cancellation', 'once-only-settlement'],
  ][caseInfo.index - 1];
  fail(markers.every((marker) => evidence.assertions.includes(marker)));
  const sources = [];
  for (const row of evidence.rendererSubmissions) {
    fail(/^[a-f0-9]{64}$/.test(row.sourceHash ?? ''));
    sources.push({ id: row.id, sourceHash: row.sourceHash });
  }
  for (const row of evidence.revisions)
    if (row.sourceHash != null) {
      fail(/^[a-f0-9]{64}$/.test(row.sourceHash));
      sources.push({ id: row.id, sourceHash: row.sourceHash });
    }
  for (const row of evidence.rendererReceipts)
    fail(
      row &&
        safeId(row.id) &&
        evidence.rendererSubmissions.some(
          (submission) => submission.id === row.id,
        ),
    );
  for (const row of evidence.rendererSubmissions)
    fail(evidence.rendererReceipts.some((receipt) => receipt.id === row.id));
  fail(
    evidence.wallets.length > 0 &&
      evidence.wallets.every((wallet) => wallet?.snapshot?.held === 0),
  );
  if (caseInfo.index === 4) {
    fail(
      evidence.rendererSubmissions.length === 0 &&
        evidence.rendererReceipts.length === 0 &&
        evidence.revisions.every((row) => row.sourceHash == null),
    );
    fail(evidence.reservations.every((row) => row.status !== 'RESERVED'));
    return sources;
  }
  for (const field of [
    'revisions',
    'reservations',
    'rendererSubmissions',
    'rendererReceipts',
  ])
    fail(evidence[field].length > 0);
  for (const revision of evidence.revisions) {
    fail(
      Array.isArray(revision.receipts) &&
        evidence.assertions.includes(`settlement:${revision.id}`),
    );
    fail(
      revision.receipts.filter(
        (receipt) =>
          receipt.kind === 'settlement' && receipt.state === 'confirmed',
      ).length === 1,
    );
    fail(
      finite(revision.consumedCredits) &&
        finite(revision.maximumCredits) &&
        revision.consumedCredits <= revision.maximumCredits,
    );
    fail(
      revision.receipts.every(
        (receipt) => receipt && finite(receipt.operatorCredits),
      ),
    );
    if (revision.status === 'completed')
      fail(evidence.assertions.includes(`media-lineage:${revision.id}`));
  }
  for (const reservation of evidence.reservations) {
    fail(
      reservation.status === 'SETTLED' &&
        finite(reservation.amount) &&
        finite(reservation.settledAmount),
    );
    const transactions = evidence.transactions.filter(
      (row) => row.reservationId === reservation.id,
    );
    fail(transactions.length === (reservation.settledAmount > 0 ? 1 : 0));
    fail(
      transactions.every((row) => finite(row.amount)) &&
        Math.abs(
          transactions.reduce((sum, row) => sum + row.amount, 0) -
            reservation.settledAmount,
        ) <= 1e-8,
    );
  }
  for (const transaction of evidence.transactions)
    if (transaction.reservationId != null)
      fail(
        evidence.reservations.some(
          (row) => row.id === transaction.reservationId,
        ),
      );
  const receipts = evidence.revisions.flatMap((row) => row.receipts);
  if ([1, 2].includes(caseInfo.index))
    fail(
      evidence.revisions.some((row) => row.status === 'completed') &&
        evidence.rendererReceipts.some((row) => row.status === 'completed'),
    );
  if ([2, 3].includes(caseInfo.index))
    fail(evidence.rendererSubmissions.length === 3);
  if (caseInfo.index === 2)
    fail(
      evidence.rendererReceipts.some((row) => row.status === 'failed') &&
        receipts.filter(
          (row) => row.kind === 'repair' && row.isResultApplied === true,
        ).length === 1,
    );
  if (caseInfo.index === 3)
    fail(
      evidence.revisions.every(
        (row) =>
          row.status === 'failed' &&
          Array.isArray(row.outputs) &&
          row.outputs.length === 0,
      ) &&
        receipts.filter(
          (row) => row.kind === 'repair' && row.isResultApplied === true,
        ).length === 2 &&
        receipts.filter((row) => row.kind === 'inspection').length === 3,
    );
  if (caseInfo.index === 5)
    fail(
      evidence.rendererReceipts.some((row) => row.status === 'running') &&
        evidence.revisions.every(
          (row) =>
            row.status === 'cancelled' &&
            Array.isArray(row.outputs) &&
            row.outputs.length === 0,
        ),
    );
  return sources;
}
export async function verifyVisualScenarioSources(identity, evidence, sources) {
  requireThat(
    typeof evidence.evidencePath === 'string' &&
      evidence.evidencePath.startsWith('raw/visual/artifacts/') &&
      evidence.evidencePath.endsWith('/evidence.json'),
    'VISUAL_SOURCE_HASH',
  );
  const hashes = [];
  for (const source of sources) {
    requireThat(
      /^[A-Za-z0-9_-]{1,200}$/.test(source.id ?? '') &&
        /^[a-f0-9]{64}$/.test(source.sourceHash ?? ''),
      'VISUAL_SOURCE_HASH',
    );
    const relative = path.join(
      path.dirname(evidence.evidencePath),
      `${source.id}.tsx`,
    );
    const bytes = await safeFile(identity.state, relative);
    requireThat(sha256(bytes) === source.sourceHash, 'VISUAL_SOURCE_HASH');
    hashes.push({ path: relative, sha256: source.sourceHash });
  }
  return hashes;
}
export const VISUAL_LIBRARY_CONTRACT = Object.freeze({
  file: 'test/integration/visual-code/visual-code-library.integration.spec.ts',
  count: 7,
  titles: [
    'visual-code connected backend and canonical Library acceptance reserves, executes a pinned workflow with a real lease, settles once and exposes the same canonical outputs on replay',
    'visual-code connected backend and canonical Library acceptance cleans the real persisted mirror when tenant execution creation fails after mirror insertion',
    'visual-code connected backend and canonical Library acceptance rejects explicit paid-model quote and create for a free actor before reservation or dispatch',
    'visual-code connected backend and canonical Library acceptance rejects cross-tenant and same-tenant cross-brand source assets before any external read or hold',
    'visual-code connected backend and canonical Library acceptance rejects actual insufficient credits without queued generation, output admission or an active hold',
    'visual-code connected backend and canonical Library acceptance keeps the renderer unavailable with enabled=undefined and creates no generation effects',
    'visual-code connected backend and canonical Library acceptance keeps the renderer unavailable with enabled=false and creates no generation effects',
  ],
});
export const VISUAL_LIBRARY_LIMITS = {
  work: 120000,
  cleanup: 60000,
  cooperative: 10000,
  term: 5000,
  kill: 5000,
  resources: 30000,
  final: 10000,
  poll: 100,
};
const realClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
async function untilDeadline(promise, deadline, clock, code) {
  const remaining = deadline - clock.now();
  if (remaining <= 0)
    return Promise.race([Promise.reject(new AcceptanceError(code)), promise]);
  let timer;
  // Custom short clocks are confined to synthetic adapter fixtures; CLI never
  // exposes a duration or adapter input.
  if (clock === realClock) {
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new AcceptanceError(code)),
            remaining,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  return Promise.race([
    promise,
    clock.sleep(remaining).then(() => {
      throw new AcceptanceError(code);
    }),
  ]);
}
function markVisualJournalFailure(ledger) {
  ledger.journalFailed = true;
  if (
    !ledger.failures.some(
      (failure) =>
        failure.stage === 'journal' &&
        failure.code === 'VISUAL_JOURNAL_WRITE_FAILED',
    )
  )
    ledger.failures.push({
      stage: 'journal',
      code: 'VISUAL_JOURNAL_WRITE_FAILED',
    });
}
export async function persistVisualJournal(ledger, write) {
  try {
    await write();
  } catch {
    markVisualJournalFailure(ledger);
    throw new AcceptanceError('VISUAL_JOURNAL_WRITE_FAILED');
  }
}
export async function removeValidatedVisualRenderers(
  ledger,
  resources,
  removeExact,
  persist,
  deadline,
) {
  let removalFailed = false;
  for (const resource of resources) {
    try {
      requireThat(Date.now() < deadline, 'RENDERER_REMOVAL_UNCONFIRMED');
      resource.id = await untilDeadline(
        removeExact(resource.name, deadline),
        deadline,
        realClock,
        'RENDERER_REMOVAL_UNCONFIRMED',
      );
      resource.removed = true;
    } catch {
      removalFailed = true;
      resource.removalFailure = 'RENDERER_REMOVAL_UNCONFIRMED';
      ledger.failures.push({
        stage: 'renderer-removal',
        code: 'RENDERER_REMOVAL_UNCONFIRMED',
        name: resource.name,
      });
    }
  }
  try {
    requireThat(Date.now() < deadline, 'VISUAL_JOURNAL_WRITE_FAILED');
    await untilDeadline(
      persist(ledger),
      deadline,
      realClock,
      'VISUAL_JOURNAL_WRITE_FAILED',
    );
  } catch {
    markVisualJournalFailure(ledger);
  }
  requireThat(!removalFailed, 'RENDERER_REMOVAL_UNCONFIRMED');
  requireThat(!ledger.journalFailed, 'VISUAL_JOURNAL_WRITE_FAILED');
}
export async function superviseVisualCase({
  caseInfo,
  adapters,
  clock = realClock,
  limits = {
    work: 900000,
    cleanup: 120000,
    cooperative: 20000,
    term: 5000,
    kill: 5000,
    resources: 80000,
    final: 10000,
    poll: 100,
  },
  cumulativeDeadline = Infinity,
}) {
  requireThat(
    VISUAL_CASES.some(
      (item) =>
        item.index === caseInfo.index &&
        item.title === caseInfo.title &&
        item.scenario === caseInfo.scenario,
    ),
    'INVALID_VISUAL_CASE',
  );
  const startedAt = clock.now();
  const workDeadline = Math.min(
    startedAt + limits.work,
    cumulativeDeadline - limits.cleanup,
  );
  const ledger = {
    version: 1,
    index: caseInfo.index,
    title: caseInfo.title,
    scenario: caseInfo.scenario,
    nonce: randomUUID(),
    startedAt,
    workDeadline,
    status: 'running',
    resources: {},
    failures: [],
    cleanup: [],
    child: null,
    receipt: null,
  };
  requireThat(workDeadline > startedAt, 'VISUAL_WORK_TIMEOUT');
  await adapters.persist(ledger);
  let handle;
  let childResult;
  let childFinished = false;
  let marker;
  try {
    requireThat(!adapters.cancelled(), 'CANCELLED');
    await untilDeadline(
      adapters.allocate(ledger, workDeadline),
      workDeadline,
      clock,
      'VISUAL_WORK_TIMEOUT',
    );
    handle = await untilDeadline(
      adapters.startChild(ledger, workDeadline),
      workDeadline,
      clock,
      'VISUAL_WORK_TIMEOUT',
    );
    handle.done.then((result) => {
      childResult = result;
      childFinished = true;
    });
    while (!childFinished && !marker) {
      requireThat(!adapters.cancelled(), 'CANCELLED');
      requireThat(clock.now() < workDeadline, 'VISUAL_WORK_TIMEOUT');
      marker = await untilDeadline(
        adapters.marker(ledger),
        workDeadline,
        clock,
        'VISUAL_WORK_TIMEOUT',
      );
      if (!marker && !childFinished)
        await clock.sleep(
          Math.min(limits.poll, Math.max(1, workDeadline - clock.now())),
        );
    }
    ledger.receipt =
      marker ??
      (await untilDeadline(
        adapters.marker(ledger),
        workDeadline,
        clock,
        'VISUAL_WORK_TIMEOUT',
      ));
  } catch (error) {
    ledger.failures.push({
      stage: 'work',
      code: error.code ?? 'VISUAL_WORK_FAILED',
    });
  }
  const cleanupStartedAt = clock.now();
  const cleanupDeadline = Math.min(
    cleanupStartedAt + limits.cleanup,
    startedAt + limits.work + limits.cleanup,
    cumulativeDeadline,
  );
  ledger.cleanupStartedAt = cleanupStartedAt;
  ledger.cleanupDeadline = cleanupDeadline;
  const cleanup = async (name, work, deadline) => {
    try {
      requireThat(clock.now() < deadline, 'VISUAL_CLEANUP_TIMEOUT');
      await untilDeadline(work(), deadline, clock, 'VISUAL_CLEANUP_TIMEOUT');
      ledger.cleanup.push({ stage: name, passed: true });
    } catch (error) {
      ledger.cleanup.push({
        stage: name,
        passed: false,
        code: error.code ?? 'VISUAL_CLEANUP_FAILED',
      });
    }
  };
  if (handle && !childFinished && marker && ledger.failures.length === 0) {
    try {
      await untilDeadline(
        handle.done,
        Math.min(cleanupDeadline, cleanupStartedAt + limits.cooperative),
        clock,
        'COOPERATIVE_TEARDOWN_TIMEOUT',
      );
    } catch {
      /* The independent TERM/KILL phase still owns termination. */
    }
  }
  const terminationDeadline = Math.min(
    cleanupDeadline,
    cleanupStartedAt + limits.cooperative + limits.term + limits.kill,
  );
  await cleanup(
    'process-groups',
    () =>
      adapters.stopGroups(ledger, {
        term: limits.term,
        kill: limits.kill,
        deadline: terminationDeadline,
      }),
    terminationDeadline,
  );
  if (handle && !childFinished) {
    try {
      childResult = await untilDeadline(
        handle.done,
        terminationDeadline,
        clock,
        'TERMINATION_UNCONFIRMED',
      );
      childFinished = true;
    } catch {
      ledger.cleanup.push({
        stage: 'child-exit',
        passed: false,
        code: 'TERMINATION_UNCONFIRMED',
      });
    }
  }
  ledger.child = childResult ?? null;
  const resourceDeadline = Math.min(
    cleanupDeadline - limits.final,
    clock.now() + limits.resources,
  );
  for (const [name, operation] of [
    ['renderer-containers', 'removeRenderers'],
    ['redis-container', 'removeRedis'],
    ['database', 'removeDatabase'],
    ['listeners', 'verifyListeners'],
  ])
    await cleanup(
      name,
      () => adapters[operation](ledger, resourceDeadline),
      resourceDeadline,
    );
  ledger.cleanupConfirmed =
    ledger.cleanup.length >= 5 && ledger.cleanup.every((entry) => entry.passed);
  try {
    requireThat(
      childFinished &&
        childResult?.exitCode === 0 &&
        !childResult.signal &&
        !childResult.outputLimit &&
        !childResult.streamError,
      'CHILD_FAILED',
    );
    ledger.cases = await untilDeadline(
      adapters.validate(ledger, childResult),
      cleanupDeadline,
      clock,
      'VISUAL_CLEANUP_TIMEOUT',
    );
    requireThat(
      ledger.receipt?.outcome === 'passed',
      'VISUAL_RECEIPT_REQUIRED',
    );
  } catch (error) {
    ledger.failures.push({
      stage: 'assertion',
      code: error.code ?? 'VISUAL_ASSERTION_FAILED',
    });
  }
  ledger.status =
    ledger.failures.length === 0 && ledger.cleanupConfirmed
      ? 'passed'
      : 'failed';
  ledger.finishedAt = clock.now();
  if (ledger.finishedAt > cleanupDeadline) {
    ledger.status = 'failed';
    ledger.cleanupConfirmed = false;
    ledger.failures.push({ stage: 'cleanup', code: 'VISUAL_CLEANUP_TIMEOUT' });
  }
  if (ledger.journalFailed) {
    ledger.status = 'failed';
    ledger.cleanupConfirmed = false;
  }
  let durableFinal = false;
  try {
    requireThat(clock.now() < cleanupDeadline, 'VISUAL_JOURNAL_WRITE_FAILED');
    await untilDeadline(
      adapters.persist(ledger),
      cleanupDeadline,
      clock,
      'VISUAL_JOURNAL_WRITE_FAILED',
    );
    durableFinal = true;
  } catch {
    markVisualJournalFailure(ledger);
  }
  if (clock.now() >= cleanupDeadline) markVisualJournalFailure(ledger);
  if (!durableFinal || ledger.journalFailed) {
    ledger.status = 'failed';
    ledger.cleanupConfirmed = false;
  }
  return ledger;
}
export async function superviseVisualCases({
  adaptersFor,
  limits,
  cumulativeDeadline = Infinity,
  onCase = async () => {},
}) {
  const ledgers = [];
  for (const caseInfo of VISUAL_CASES) {
    const ledger = await superviseVisualCase({
      caseInfo,
      adapters: adaptersFor(caseInfo),
      limits,
      cumulativeDeadline,
    });
    ledgers.push(ledger);
    await onCase(ledger, caseInfo);
    requireThat(ledger.cleanupConfirmed, 'VISUAL_CLEANUP_UNCONFIRMED');
  }
  return ledgers;
}
async function visualQuietCommand(executable, args, cwd, env, deadline) {
  requireThat(Date.now() < deadline, 'VISUAL_DEADLINE');
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeGroups.add(child.pid);
  let stdout = '';
  let stderr = '';
  let total = 0;
  let capped = false;
  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  };
  for (const [stream, field] of [
    [child.stdout, 'stdout'],
    [child.stderr, 'stderr'],
  ])
    stream.on('data', (chunk) => {
      total += chunk.length;
      if (total > 32768) {
        capped = true;
        kill();
      } else if (field === 'stdout') stdout += chunk;
      else stderr += chunk;
    });
  const timer = setTimeout(kill, Math.max(1, deadline - Date.now()));
  return new Promise((resolve) => {
    child.once('error', () => {});
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      activeGroups.delete(child.pid);
      resolve({
        exitCode,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        capped,
      });
    });
  });
}
export async function startVisualProcess({
  executable,
  args,
  cwd,
  env,
  stdoutPath,
  stderrPath,
  onSpawn,
  beforeSpawn,
}) {
  await privateFile(stdoutPath, '');
  await privateFile(stderrPath, '');
  beforeSpawn?.();
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeGroups.add(child.pid);
  onSpawn?.(child.pid);
  let outputLimit = false;
  let streamError = false;
  let total = 0;
  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  };
  const pipelines = [
    [child.stdout, stdoutPath],
    [child.stderr, stderrPath],
  ].map(([stream, file]) => {
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        const retained = Math.min(chunk.length, Math.max(0, RAW_LIMIT - total));
        total += retained;
        if (retained) this.push(chunk.subarray(0, retained));
        if (retained < chunk.length) {
          outputLimit = true;
          kill();
        }
        callback();
      },
    });
    return pipeline(
      stream,
      limiter,
      createWriteStream(file, { flags: 'a', mode: 0o600 }),
    ).catch(() => {
      streamError = true;
      kill();
    });
  });
  const done = new Promise((resolve) => {
    child.once('error', () => {
      streamError = true;
    });
    child.once('close', async (exitCode, signal) => {
      await Promise.all(pipelines);
      activeGroups.delete(child.pid);
      resolve({ exitCode, signal, outputLimit, streamError });
    });
  });
  return { pid: child.pid, child, done };
}
export async function stopVisualGroups(pids, { term, kill, deadline }) {
  const owned = pids.filter((pid) => Number.isSafeInteger(pid) && pid > 1);
  const signal = (pid, value) => {
    try {
      process.kill(-pid, value);
    } catch (error) {
      if (error.code !== 'ESRCH')
        throw new AcceptanceError('TERMINATION_UNCONFIRMED');
    }
  };
  const alive = (pid) => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw new AcceptanceError('TERMINATION_UNCONFIRMED');
    }
  };
  for (const pid of owned) signal(pid, 'SIGTERM');
  const termDeadline = Math.min(deadline, Date.now() + term);
  while (owned.some(alive) && Date.now() < termDeadline)
    await realClock.sleep(50);
  for (const pid of owned) if (alive(pid)) signal(pid, 'SIGKILL');
  const killDeadline = Math.min(deadline, Date.now() + kill);
  while (owned.some(alive) && Date.now() < killDeadline)
    await realClock.sleep(50);
  requireThat(
    owned.every((pid) => !alive(pid)),
    'TERMINATION_UNCONFIRMED',
  );
}
async function requirePortAbsent(port) {
  const { createConnection } = await import('node:net');
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      reject(new AcceptanceError('LISTENER_NOT_ABSENT'));
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(new AcceptanceError('LISTENER_UNCONFIRMED'));
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new AcceptanceError('LISTENER_UNCONFIRMED'));
    });
  });
}
async function visualScenarioReceipt(identity, root, scenario) {
  const metadata = await lstat(root);
  requireThat(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      (await realpath(root)) === root,
    'UNSAFE_VISUAL_RECEIPT',
  );
  const entries = await readdir(root, { withFileTypes: true });
  requireThat(
    entries.every(
      (entry) =>
        entry.isDirectory() ||
        (entry.isFile() && entry.name === 'runtime-preflight.json'),
    ),
    'UNSAFE_VISUAL_RECEIPT',
  );
  const directories = entries.filter((entry) => entry.isDirectory());
  requireThat(directories.length <= 1, 'VISUAL_SCENARIO_INVENTORY');
  if (directories.length === 0) return null;
  const directory = directories[0].name;
  requireThat(
    new RegExp(`^${scenario}-[a-f0-9-]{36}$`).test(directory),
    'VISUAL_SCENARIO_INVENTORY',
  );
  const relative = path.relative(
    identity.state,
    path.join(root, directory, 'evidence.json'),
  );
  let bytes;
  try {
    bytes = await safeFile(identity.state, relative);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let receipt;
  try {
    receipt = JSON.parse(bytes);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  requireThat(
    receipt.gitHead === identity.candidateSHA &&
      receipt.transportMode === 'local-runtime' &&
      receipt.scenario === scenario &&
      receipt.rendererVersion === '4.0.530',
    'VISUAL_RECEIPT_IDENTITY',
  );
  if (receipt.label !== 'before-cleanup') return null;
  return { ...receipt, evidenceSHA256: sha256(bytes), evidencePath: relative };
}

export const DEDICATED_BUDGETS = {
  'baseline-materialization-migration': {
    setup: 45000,
    work: 45000,
    cleanup: 15000,
    seal: 0,
    workEnd: 45000,
    cleanupEnd: 60000,
    term: 3000,
    kill: 2000,
  },
  'agent-production': {
    setup: 300000,
    migration: 600000,
    work: 165000,
    cleanup: 15000,
    seal: 120000,
    workEnd: 1065000,
    cleanupEnd: 1080000,
    term: 3000,
    kill: 2000,
  },
  'brand-acceptance': {
    setup: 300000,
    units: 60000,
    work: 1140000,
    cleanup: 120000,
    seal: 180000,
    workEnd: 1500000,
    cleanupEnd: 1620000,
    term: 10000,
    kill: 10000,
  },
};
function markDedicatedJournalFailure(ledger) {
  ledger.journalFailed = true;
  if (
    !ledger.failures.some(
      (item) => item.code === 'DEDICATED_JOURNAL_WRITE_FAILED',
    )
  )
    ledger.failures.push({
      stage: 'journal',
      code: 'DEDICATED_JOURNAL_WRITE_FAILED',
    });
}
export async function superviseDedicatedAcceptance({
  identity,
  adapters,
  clock = realClock,
}) {
  const budget = DEDICATED_BUDGETS[identity.group];
  requireThat(budget, 'INVALID_GROUP');
  const ledger = {
    version: 1,
    group: identity.group,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    resources: { groups: [], services: [], database: null },
    completed: [],
    failures: [],
    commands: [],
    cleanup: [],
    status: 'running',
  };
  await adapters.persist(ledger);
  const phase = async (stage, duration, absolute, work) => {
    requireThat(!adapters.cancelled(), 'CANCELLED');
    const end = Math.min(clock.now() + duration, identity.startedAt + absolute);
    requireThat(clock.now() < end, 'DEDICATED_PHASE_DEADLINE');
    await untilDeadline(work(end), end, clock, 'DEDICATED_PHASE_DEADLINE');
    ledger.completed.push({
      stage,
      ...(stage === 'brand-acceptance-units'
        ? { cases: ledger.unitCases }
        : {}),
    });
  };
  let workResult;
  try {
    await phase('dedicated-preparation', budget.setup, budget.setup, (end) =>
      adapters.prepare(ledger, end),
    );
    if (budget.migration)
      await phase(
        'agent-production-migration',
        budget.migration,
        budget.setup + budget.migration,
        (end) => adapters.migrate(ledger, end),
      );
    if (budget.units)
      await phase(
        'brand-acceptance-units',
        budget.units,
        budget.setup + budget.units,
        (end) => adapters.units(ledger, end),
      );
    const end = Math.min(
      clock.now() + budget.work,
      identity.startedAt + budget.workEnd,
    );
    requireThat(
      !adapters.cancelled() &&
        clock.now() < end &&
        end + budget.cleanup <= identity.startedAt + budget.cleanupEnd,
      'DEDICATED_PHASE_DEADLINE',
    );
    const handle = await untilDeadline(
      adapters.startWork(ledger, end),
      end,
      clock,
      'DEDICATED_WORK_TIMEOUT',
    );
    workResult = await untilDeadline(
      handle.done,
      end,
      clock,
      'DEDICATED_WORK_TIMEOUT',
    );
    ledger.originalChild = workResult;
    requireThat(
      workResult.exitCode === 0 &&
        !workResult.signal &&
        !workResult.outputLimit &&
        !workResult.streamError,
      'CHILD_FAILED',
    );
  } catch (error) {
    ledger.failures.push({
      stage: 'work',
      code: error.code ?? 'DEDICATED_WORK_FAILED',
    });
  }
  const cleanupStartedAt = clock.now();
  const end = Math.min(
    cleanupStartedAt + budget.cleanup,
    identity.startedAt + budget.cleanupEnd,
  );
  ledger.cleanupStartedAt = cleanupStartedAt;
  ledger.cleanupDeadline = end;
  const cleanup = async (stage, operation) => {
    try {
      requireThat(clock.now() < end, 'DEDICATED_CLEANUP_TIMEOUT');
      await untilDeadline(operation(), end, clock, 'DEDICATED_CLEANUP_TIMEOUT');
      ledger.cleanup.push({ stage, passed: true });
    } catch (error) {
      ledger.cleanup.push({
        stage,
        passed: false,
        code: error.code ?? 'DEDICATED_CLEANUP_FAILED',
      });
    }
  };
  await cleanup('process-groups', () =>
    adapters.stopGroups(ledger, {
      term: budget.term,
      kill: budget.kill,
      deadline: Math.min(end, cleanupStartedAt + budget.term + budget.kill),
    }),
  );
  const resourceEnd =
    identity.group === 'brand-acceptance'
      ? Math.min(end - 20000, clock.now() + 80000)
      : identity.group === 'baseline-materialization-migration'
        ? Math.min(end - 2000, clock.now() + 8000)
        : end;
  await cleanup('database', () => adapters.dropDatabase(ledger, resourceEnd));
  for (const service of [...ledger.resources.services])
    await cleanup(`service-${service.kind}`, () =>
      adapters.removeService(ledger, service, resourceEnd),
    );
  try {
    if (
      workResult &&
      workResult.exitCode === 0 &&
      !workResult.signal &&
      !workResult.outputLimit &&
      !workResult.streamError
    ) {
      const cases = await untilDeadline(
        adapters.validate(ledger, workResult),
        end,
        clock,
        'DEDICATED_CLEANUP_TIMEOUT',
      );
      ledger.completed.push({ stage: identity.group, cases });
    }
  } catch (error) {
    ledger.failures.push({
      stage: 'report',
      code: error.code ?? 'INVALID_REPORT',
    });
  }
  ledger.cleanupConfirmed =
    ledger.cleanup.length === 2 + ledger.resources.services.length &&
    ledger.cleanup.every((item) => item.passed);
  ledger.status =
    ledger.failures.length === 0 &&
    ledger.cleanupConfirmed &&
    !ledger.journalFailed &&
    !ledger.cleanupTerminationFailed
      ? 'passed'
      : 'failed';
  if (adapters.finalize)
    try {
      await untilDeadline(
        adapters.finalize(ledger),
        end,
        clock,
        'DEDICATED_CLEANUP_TIMEOUT',
      );
    } catch (error) {
      ledger.status = 'failed';
      ledger.failures.push({
        stage: 'evidence',
        code: error.code ?? 'UNSAFE_REPORT',
      });
    }
  let durable = false;
  try {
    requireThat(clock.now() < end, 'DEDICATED_JOURNAL_WRITE_FAILED');
    await untilDeadline(
      adapters.persist(ledger),
      end,
      clock,
      'DEDICATED_JOURNAL_WRITE_FAILED',
    );
    durable = true;
  } catch {
    markDedicatedJournalFailure(ledger);
  }
  if (!durable || ledger.journalFailed || clock.now() >= end) {
    ledger.status = 'failed';
    ledger.cleanupConfirmed = false;
  }
  return ledger;
}
export function dedicatedChildEnvironment(env, group, url, redis, owned) {
  const credentials = readPostgresCredentials(env);
  const name =
    group === 'agent-production'
      ? 'genfeed_agent_production_4959_test'
      : 'genfeed_branded_acceptance_test';
  validateUrl(url, 'postgres', name, credentials);
  requireThat(
    owned?.database === name &&
      owned.migrated === (group === 'agent-production') &&
      /^[a-f0-9]{64}$/.test(owned.postgres ?? ''),
    'DEDICATED_OWNERSHIP',
  );
  const result = {
    ...env,
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=2048',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TURBO_TOKEN: '',
    REPLICATE_API_TOKEN: 'test-mock-key',
    STRIPE_SECRET_KEY: 'test-mock-key',
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
  };
  delete result.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  delete result.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  delete result.PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB;
  if (group === 'agent-production') {
    requireThat(
      /^[a-f0-9]{64}$/.test(owned.redis ?? '') &&
        owned.redis !== owned.postgres &&
        owned.redisEmpty === true &&
        redis === 'redis://127.0.0.1:6379/14',
      'DEDICATED_OWNERSHIP',
    );
    validateUrl(redis, 'redis');
    Object.assign(result, {
      DATABASE_URL: url,
      REDIS_URL: redis,
      PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB: '1',
    });
  } else {
    requireThat(group === 'brand-acceptance', 'INVALID_GROUP');
    result.BRANDED_GENERATION_TEST_DATABASE_URL = url;
    delete result.DATABASE_URL;
    delete result.REDIS_URL;
  }
  return result;
}
export function startDedicatedControlProcess({ executable, args, cwd, env }) {
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeGroups.add(child.pid);
  let stdout = '';
  let stderr = '';
  let size = 0;
  let outputLimit = false;
  let streamError = false;
  const terminate = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  };
  for (const [stream, kind] of [
    [child.stdout, 'stdout'],
    [child.stderr, 'stderr'],
  ]) {
    stream.once('error', () => {
      streamError = true;
      terminate();
    });
    stream.on('data', (bytes) => {
      const kept = Math.min(bytes.length, Math.max(0, 65536 - size));
      size += kept;
      if (kind === 'stdout') stdout += bytes.subarray(0, kept).toString();
      else stderr += bytes.subarray(0, kept).toString();
      if (kept < bytes.length) {
        outputLimit = true;
        terminate();
      }
    });
  }
  const done = new Promise((resolve) => {
    child.once('error', () => {
      streamError = true;
    });
    child.once('close', (exitCode, signal) => {
      activeGroups.delete(child.pid);
      resolve({
        exitCode,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        outputLimit,
        streamError,
      });
    });
  });
  return { pid: child.pid, child, done };
}
export async function performDedicatedCleanup(
  ledger,
  operation,
  persist,
  deadline,
) {
  let failure;
  try {
    requireThat(Date.now() < deadline, 'DEDICATED_CLEANUP_TIMEOUT');
    await untilDeadline(
      operation(),
      deadline,
      realClock,
      'DEDICATED_CLEANUP_TIMEOUT',
    );
  } catch (error) {
    failure = error;
  }
  try {
    requireThat(Date.now() < deadline, 'DEDICATED_JOURNAL_WRITE_FAILED');
    await untilDeadline(
      persist(ledger),
      deadline,
      realClock,
      'DEDICATED_JOURNAL_WRITE_FAILED',
    );
  } catch {
    markDedicatedJournalFailure(ledger);
  }
  if (failure) throw failure;
  requireThat(!ledger.journalFailed, 'DEDICATED_JOURNAL_WRITE_FAILED');
}
export async function startRegisteredDedicatedProcess(
  ledger,
  stage,
  start,
  retain,
  persist,
) {
  if (stage === 'database-allocation')
    requireThat(
      ledger.resources.database?.intentPersisted === true,
      'DEDICATED_OWNERSHIP',
    );
  const handle = await start();
  requireThat(
    Number.isSafeInteger(handle.pid) && handle.pid > 1,
    'DEDICATED_PROCESS_OWNERSHIP',
  );
  retain(handle);
  ledger.resources.groups.push(handle.pid);
  if (stage === 'database-allocation') {
    ledger.resources.database.creationAuthorized = true;
    ledger.resources.database.creationIssued = true;
  }
  await persist(ledger);
  return handle;
}
async function executeDedicatedAcceptance(identity, env, baseline = false) {
  const baselineStartedAt = Date.now();
  const credentials = readPostgresCredentials(env);
  if (baseline) await verifyBaselineSources(identity.repo);
  else {
    requireThat(identity.phase === 'prepared', 'INVALID_PHASE');
    await verifyDedicatedSources(identity.repo, identity.group, env);
  }
  requireThat(
    (await head(identity.repo)) === identity.candidateSHA,
    'CHECKOUT_MISMATCH',
  );
  if (!baseline) {
    identity.phase = 'running';
    await persistIdentity(identity);
  }
  const prefix = baseline ? 'baseline' : 'dedicated';
  const base = {
    ...env,
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=2048',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TURBO_TOKEN: '',
    REPLICATE_API_TOKEN: 'test-mock-key',
    STRIPE_SECRET_KEY: 'test-mock-key',
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
  };
  for (const key of [
    'RUNTIME_ACCEPTANCE_POSTGRES_USER',
    'RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD',
    'PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB',
    'BRANDED_GENERATION_TEST_DATABASE_URL',
    'DATABASE_URL',
    'REDIS_URL',
  ])
    delete base[key];
  let sequence = 0;
  let workReport;
  let workHandle;
  const handles = [];
  const persist = async (ledger) => {
    try {
      await atomicJson(
        path.join(identity.state, `raw/${prefix}-ledger.json`),
        ledger,
      );
    } catch {
      markDedicatedJournalFailure(ledger);
      throw new AcceptanceError('DEDICATED_JOURNAL_WRITE_FAILED');
    }
  };
  identity.evidence.push(`raw/${prefix}-ledger.json`);
  await persistIdentity(identity);
  const processStart = async (ledger, stage, executable, args, extra = {}) => {
    const root = `raw/${prefix}-${sequence++}-${stage}`;
    identity.evidence.push(`${root}.stdout`, `${root}.stderr`);
    await persistIdentity(identity);
    const handle = await startRegisteredDedicatedProcess(
      ledger,
      stage,
      () =>
        startVisualProcess({
          executable,
          args,
          cwd:
            baseline || stage === 'migration'
              ? path.join(identity.repo, 'packages/prisma')
              : path.join(identity.repo, 'apps/server/api'),
          env: { ...base, ...extra },
          stdoutPath: path.join(identity.state, `${root}.stdout`),
          stderrPath: path.join(identity.state, `${root}.stderr`),
        }),
      (owned) => {
        handles.push(owned);
        owned.stage = stage;
        owned.done.then((result) => {
          owned.observed = result;
        });
      },
      persist,
    );
    return { ...handle, stdoutRelative: `${root}.stdout` };
  };
  const command = async (ledger, stage, executable, args, end, extra = {}) => {
    const handle = await processStart(ledger, stage, executable, args, extra);
    let result;
    try {
      result = await untilDeadline(
        handle.done,
        end,
        realClock,
        'DEDICATED_PHASE_DEADLINE',
      );
    } catch (error) {
      try {
        process.kill(-handle.pid, 'SIGKILL');
      } catch {}
      throw error;
    }
    ledger.commands.push({ stage, ...result });
    requireThat(
      result.exitCode === 0 &&
        !result.signal &&
        !result.outputLimit &&
        !result.streamError,
      'CHILD_FAILED',
    );
    return (await safeFile(identity.state, handle.stdoutRelative, 65536))
      .toString('utf8')
      .trim();
  };
  const control = async (
    ledger,
    args,
    end,
    extra = {},
    allowMissing = false,
  ) => {
    requireThat(Date.now() < end, 'DEDICATED_CLEANUP_TIMEOUT');
    const handle = startDedicatedControlProcess({
      executable: 'docker',
      args,
      cwd: identity.repo,
      env: { ...base, ...extra },
    });
    handles.push(handle);
    ledger.resources.groups.push(handle.pid);
    let result;
    try {
      result = await untilDeadline(
        handle.done,
        end,
        realClock,
        'DEDICATED_CLEANUP_TIMEOUT',
      );
      requireThat(
        !result.signal &&
          !result.outputLimit &&
          !result.streamError &&
          (allowMissing || result.exitCode === 0),
        'CHILD_FAILED',
      );
      await stopVisualGroups([handle.pid], {
        term: 0,
        kill: 2000,
        deadline: end,
      });
      return result;
    } catch (error) {
      try {
        process.kill(-handle.pid, 'SIGKILL');
      } catch {}
      try {
        await stopVisualGroups([handle.pid], {
          term: 0,
          kill: 2000,
          deadline: end,
        });
        await untilDeadline(
          handle.done,
          end,
          realClock,
          'TERMINATION_UNCONFIRMED',
        );
      } catch {
        ledger.cleanupTerminationFailed = true;
      }
      throw error;
    }
  };
  const pg = async (ledger, args, end, stage = 'postgres') => {
    const call = postgresClientInvocation(
      ledger.resources.postgres,
      args,
      credentials,
    );
    return command(ledger, stage, 'docker', call.args, end, call.env);
  };
  const spec = baseline
    ? {
        file: 'prisma/content-learning-baseline-materialization-migration.test.ts',
        titles: BASELINE_SOURCE_CONTRACT.passedTitles,
        count: 7,
      }
    : identity.group === 'agent-production'
      ? {
          file: DELEGATED_API_FILES[0],
          titles: AGENT_PRODUCTION_TITLES,
          count: 6,
        }
      : {
          file: DELEGATED_API_FILES[1],
          titles: BRAND_SOURCE_CONTRACT.brand.passedTitles,
          count: 17,
        };
  const vitestStart = async (
    ledger,
    stage,
    files,
    config,
    maxWorkers,
    extra,
  ) => {
    const relative = `raw/${prefix}-${stage}.report.json`;
    identity.evidence.push(relative);
    await persistIdentity(identity);
    const args = [
      '--max-old-space-size=2048',
      path.join(identity.repo, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      config,
      `--maxWorkers=${maxWorkers}`,
      '--no-file-parallelism',
      ...privateVitestReporterArguments(path.join(identity.state, relative)),
      '--passWithNoTests=false',
      ...files,
    ];
    const handle = await processStart(
      ledger,
      stage,
      process.execPath,
      args,
      extra,
    );
    return { ...handle, reportRelative: relative };
  };
  const normalizeReport = async (relative) => {
    const file = path.join(identity.state, relative);
    const metadata = await lstat(file);
    requireThat(
      metadata.isFile() && !metadata.isSymbolicLink(),
      'UNSAFE_REPORT',
    );
    await chmod(file, 0o600);
    return JSON.parse(await safeFile(identity.state, relative));
  };
  const adapters = {
    persist,
    cancelled: () => cancelled,
    async prepare(ledger, end) {
      await diskGuard(identity.repo);
      const ids = [
        ['postgres', env.RUNTIME_ACCEPTANCE_POSTGRES_ID],
        ...(identity.group === 'agent-production'
          ? [['redis', env.RUNTIME_ACCEPTANCE_REDIS_ID]]
          : []),
      ];
      requireThat(
        ids.every(([, id]) => /^[a-f0-9]{64}$/.test(id ?? '')) &&
          new Set(ids.map(([, id]) => id)).size === ids.length,
        'DEDICATED_OWNERSHIP',
      );
      const inspectionFailures = [];
      for (const [kind, id] of ids)
        try {
          const inspected = JSON.parse(
            (await control(ledger, ['container', 'inspect', id], end)).stdout,
          );
          requireThat(
            inspected.length === 1 && inspected[0].Id === id,
            'DEDICATED_OWNERSHIP',
          );
          if (!baseline)
            ledger.resources.services.push({ kind, id, inspected: true });
          ledger.resources[kind] = id;
        } catch (error) {
          inspectionFailures.push(error);
        }
      if (baseline)
        requireThat(
          ledger.resources.postgres === identity.resources.postgres,
          'DEDICATED_OWNERSHIP',
        );
      await persist(ledger);
      requireThat(
        inspectionFailures.length === 0 &&
          (baseline || ledger.resources.services.length === ids.length),
        'DEDICATED_OWNERSHIP',
      );
      const name = baseline
        ? 'genfeed_baseline_materialization_test'
        : identity.group === 'agent-production'
          ? 'genfeed_agent_production_4959_test'
          : 'genfeed_branded_acceptance_test';
      requireThat(
        (await pg(
          ledger,
          [
            '-d',
            'test',
            '-tAc',
            `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
          ],
          end,
        )) === '',
        'DATABASE_ALREADY_EXISTS',
      );
      ledger.resources.database = {
        name,
        creationAuthorized: false,
        creationIntent: true,
        postgresId: ledger.resources.postgres,
        created: false,
        migrated: false,
      };
      if (baseline) {
        identity.resources.databases.push(ledger.resources.database);
        await persistIdentity(identity);
      }
      await persist(ledger);
      ledger.resources.database.intentPersisted = true;
      ledger.resources.database.postgresId = ledger.resources.postgres;
      await pg(
        ledger,
        [
          '-d',
          'test',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `CREATE DATABASE "${name}"`,
        ],
        end,
        'database-allocation',
      );
      ledger.resources.database.created = true;
      await persist(ledger);
      if (identity.group === 'agent-production') {
        const size = await command(
          ledger,
          'redis',
          'docker',
          ['exec', ledger.resources.redis, 'redis-cli', '-n', '14', 'DBSIZE'],
          end,
        );
        requireThat(size === '0', 'DEDICATED_REDIS_NOT_EMPTY');
        ledger.resources.redisEmpty = true;
        await persist(ledger);
      }
    },
    async migrate(ledger, end) {
      const url = databaseUrl(ledger.resources.database.name, credentials);
      await command(
        ledger,
        'migration',
        'bun',
        ['x', 'prisma', 'migrate', 'deploy'],
        end,
        { DATABASE_URL: url },
      );
      ledger.resources.database.migrated = true;
      await persist(ledger);
    },
    async units(ledger, end) {
      const contracts = BRAND_SOURCE_CONTRACT.unitFiles.map((entry) => ({
        file: entry.path.slice('apps/server/api/'.length),
      }));
      const handle = await vitestStart(
        ledger,
        'units',
        contracts.map((entry) => entry.file),
        'vitest.config.ts',
        2,
        {},
      );
      const result = await untilDeadline(
        handle.done,
        end,
        realClock,
        'DEDICATED_PHASE_DEADLINE',
      );
      ledger.commands.push({ stage: 'units', ...result });
      requireThat(!result.outputLimit && !result.streamError, 'CHILD_FAILED');
      const report = await normalizeReport(handle.reportRelative);
      ledger.unitCases = validateReport(report, contracts, result);
    },
    async startWork(ledger) {
      const url = databaseUrl(ledger.resources.database.name, credentials);
      const extra = baseline
        ? { DATABASE_URL: url }
        : dedicatedChildEnvironment(
            env,
            identity.group,
            url,
            'redis://127.0.0.1:6379/14',
            {
              database: ledger.resources.database.name,
              migrated: ledger.resources.database.migrated,
              postgres: ledger.resources.postgres,
              redis: ledger.resources.redis,
              redisEmpty: ledger.resources.redisEmpty,
            },
          );
      workHandle = await vitestStart(
        ledger,
        'integration',
        [spec.file],
        baseline ? 'vitest.config.ts' : 'vitest.config.e2e.ts',
        1,
        extra,
      );
      workReport = workHandle.reportRelative;
      return workHandle;
    },
    async stopGroups(ledger, limits) {
      let failure;
      try {
        await stopVisualGroups(ledger.resources.groups, limits);
      } catch (error) {
        failure = error;
      }
      for (const handle of handles) {
        try {
          const result = await untilDeadline(
            handle.done,
            limits.deadline,
            realClock,
            'TERMINATION_UNCONFIRMED',
          );
          if (handle.stage)
            ledger.commands.push({ stage: handle.stage, ...result });
          if (handle.stage === 'integration') ledger.originalChild ??= result;
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },
    async dropDatabase(ledger, end) {
      const resource = ledger.resources.database;
      if (!resource?.creationAuthorized) return;
      await performDedicatedCleanup(
        ledger,
        async () => {
          const call = postgresClientInvocation(
            ledger.resources.postgres,
            [
              '-d',
              'test',
              '-v',
              'ON_ERROR_STOP=1',
              '-c',
              `DROP DATABASE IF EXISTS "${resource.name}" WITH (FORCE)`,
            ],
            credentials,
          );
          await control(ledger, call.args, end, call.env);
          const verify = postgresClientInvocation(
            ledger.resources.postgres,
            [
              '-d',
              'test',
              '-tAc',
              `SELECT 1 FROM pg_database WHERE datname = '${resource.name}'`,
            ],
            credentials,
          );
          requireThat(
            (await control(ledger, verify.args, end, verify.env)).stdout === '',
            'DATABASE_REMOVAL_UNCONFIRMED',
          );
          resource.removed = true;
        },
        persist,
        end,
      );
    },
    async removeService(ledger, service, end) {
      requireThat(
        service.inspected && /^[a-f0-9]{64}$/.test(service.id),
        'DEDICATED_OWNERSHIP',
      );
      await performDedicatedCleanup(
        ledger,
        async () => {
          await control(
            ledger,
            ['rm', '--force', '--volumes', service.id],
            end,
          );
          const result = await control(
            ledger,
            ['container', 'inspect', service.id],
            end,
            {},
            true,
          );
          requireThat(
            result.exitCode !== 0 &&
              /^Error response from daemon: No such (?:container|object):/.test(
                result.stderr,
              ),
            'CONTAINER_ABSENCE_UNCONFIRMED',
          );
          service.removed = true;
        },
        persist,
        end,
      );
    },
    async validate(_ledger, result) {
      return validateReport(await normalizeReport(workReport), [spec], result);
    },
    async finalize() {
      for (const relative of identity.evidence.filter(
        (file) =>
          file.startsWith(`raw/${prefix}-`) && file.endsWith('.report.json'),
      )) {
        try {
          await normalizeReport(relative);
        } catch (error) {
          if (error.code !== 'ENOENT')
            throw new AcceptanceError('UNSAFE_REPORT');
        }
      }
    },
  };
  const ledger = await superviseDedicatedAcceptance({
    identity: baseline
      ? {
          ...identity,
          group: 'baseline-materialization-migration',
          startedAt: baselineStartedAt,
        }
      : identity,
    adapters,
  });
  if (baseline) {
    if (ledger.status === 'passed') {
      ledger.sourceCases = 2;
      ledger.postgresCases = 5;
    }
    return ledger;
  }
  identity.phase = 'finished';
  await persistIdentity(identity);
  const outcome = {
    version: 1,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    group: identity.group,
    status: ledger.status,
    completed: ledger.completed,
    failures: ledger.failures,
    cleanup: { passed: ledger.cleanupConfirmed, operations: ledger.cleanup },
    commands: ledger.commands,
    originalChild: ledger.originalChild,
  };
  await atomicJson(path.join(identity.state, 'outcome.json'), outcome);
  if (outcome.status === 'passed')
    await privateFile(
      path.join(identity.state, 'receipt.json'),
      JSON.stringify(outcome),
    );
  return outcome;
}
export async function verifyFinalLearningCleanup(
  identity,
  { snapshot: readSnapshot, save, clock = Date.now },
  end,
) {
  const resource = identity.resources.learning;
  requireThat(
    hasFinalLearningTerminationProof(resource),
    'LEARNING_TERMINATION_UNCONFIRMED',
  );
  const metadata = await lstat(resource.receiptPath);
  const bytes = await safeFile(identity.state, resource.receiptRelative, 16384);
  requireThat(
    metadata.ino === resource.receiptMetadata.inode &&
      metadata.dev === resource.receiptMetadata.device &&
      sha256(bytes) === resource.receiptHash,
    'LEARNING_RECEIPT_REPLACED',
  );
  const snapshot = await readSnapshot(end);
  requireThat(
    snapshot.receipt.containerId === resource.receipt.containerId &&
      snapshot.receipt.imageId === resource.receipt.imageId &&
      snapshot.receipt.redisRunId === resource.receipt.redisRunId,
    'LEARNING_RESOURCE_IDENTITY',
  );
  const directory = await lstat(resource.directory);
  requireThat(
    directory.isDirectory() &&
      !directory.isSymbolicLink() &&
      directory.ino === resource.directoryMetadata.inode &&
      directory.dev === resource.directoryMetadata.device,
    'LEARNING_DIRECTORY_REPLACED',
  );
  const names = await readdir(resource.directory);
  const cleanupNames = names.filter((name) =>
    /^learning-runtime-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-cleanup\.json$/.test(
      name,
    ),
  );
  requireThat(
    cleanupNames.length === requireLearningSourceContract().cleanupReceipts &&
      names.every(
        (name) =>
          name === 'redis-ownership.json' || cleanupNames.includes(name),
      ),
    'LEARNING_CLEANUP_INVENTORY',
  );
  for (const name of cleanupNames) {
    const relative = `raw/learning-runtime/${name}`;
    const cleanup = JSON.parse(await safeFile(identity.state, relative));
    requireThat(
      cleanup.version === 1 &&
        cleanup.success === true &&
        cleanup.candidateSHA === identity.candidateSHA &&
        cleanup.receiptHash === resource.receiptHash &&
        cleanup.claimValue ===
          `${resource.receipt.ownerNonce}:${cleanup.fixtureId}` &&
        name === `learning-runtime-${cleanup.fixtureId}-cleanup.json` &&
        Array.isArray(cleanup.inventories) &&
        cleanup.inventories.length === 5,
      'LEARNING_CLEANUP_INVENTORY',
    );
    let keys = 0;
    for (const [db, inventory] of cleanup.inventories.entries()) {
      requireThat(
        inventory.db === db &&
          Array.isArray(inventory.keys) &&
          inventory.keys.every((key) => typeof key === 'string') &&
          new Set(inventory.keys).size === inventory.keys.length,
        'LEARNING_CLEANUP_INVENTORY',
      );
      keys += inventory.keys.length;
    }
    requireThat(keys <= 10000, 'LEARNING_CLEANUP_INVENTORY');
    identity.evidence.push(relative);
  }
  requireThat(clock() < end, 'LEARNING_CLEANUP_DEADLINE');
  resource.blankVerified = true;
  resource.blankCheckedAt = clock();
  resource.cleanupEvidence = cleanupNames.map(
    (name) => `raw/learning-runtime/${name}`,
  );
  await save(
    'raw/learning-runtime-blank.json',
    JSON.stringify({
      candidateSHA: identity.candidateSHA,
      containerId: resource.receipt.containerId,
      redisRunId: resource.receipt.redisRunId,
      checkedAt: resource.blankCheckedAt,
      keyspace: snapshot.keyspace,
      sizes: snapshot.sizes,
    }),
  );
  return {
    passed: true,
    operations: [{ name: 'learning-blank-instance', passed: true }],
    failures: [],
  };
}

export async function execution(identity, env) {
  if (['agent-production', 'brand-acceptance'].includes(identity.group))
    return executeDedicatedAcceptance(identity, env);
  if (identity.group === 'final') {
    requireLearningSourceContract();
    requireThat(
      JSON.stringify(identity.learningCi) ===
        JSON.stringify(learningCiIdentity(env)),
      'LEARNING_CI_IDENTITY_REQUIRED',
    );
  }
  const credentials = readPostgresCredentials(env);
  requireThat(identity.phase === 'prepared', 'INVALID_PHASE');
  identity.phase = 'running';
  await persistIdentity(identity);
  const completed = [];
  const failures = [];
  const commands = [];
  const serviceVersions = {};
  const deadline =
    identity.overallDeadline -
    (identity.group === 'visual-connected' ? 300000 : 120000);
  let phaseDeadline = ['visual-connected', 'visual-isolation'].includes(
    identity.group,
  )
    ? identity.setupDeadline
    : deadline;
  const capture = (executable, args, cwd, commandEnv, timeoutMs = 15000) => {
    requireThat(
      !cancelled && Date.now() < phaseDeadline,
      cancelled ? 'CANCELLED' : 'AGGREGATE_DEADLINE',
    );
    return captureCommand(
      executable,
      args,
      cwd,
      commandEnv,
      Math.min(timeoutMs, phaseDeadline - Date.now()),
    );
  };
  const cleanupCapture = (
    executable,
    args,
    cwd,
    commandEnv,
    timeoutMs = 15000,
  ) => {
    requireThat(Date.now() < identity.overallDeadline, 'CLEANUP_DEADLINE');
    return captureCommand(
      executable,
      args,
      cwd,
      commandEnv,
      Math.min(timeoutMs, identity.overallDeadline - Date.now()),
    );
  };
  const privateEnv = {
    ...env,
    NODE_ENV: 'test',
    TURBO_TOKEN: '',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    NODE_OPTIONS: '--max-old-space-size=2048',
    REPLICATE_API_TOKEN: 'test-mock-key',
    STRIPE_SECRET_KEY: 'test-mock-key',
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
  };
  delete privateEnv.PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB;
  delete privateEnv.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  delete privateEnv.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  delete privateEnv.LEARNING_DATASET_PROFILE;
  delete privateEnv.LEARNING_DATASET_BENCHMARK;
  const save = async (relative, bytes) => {
    await privateFile(path.join(identity.state, relative), bytes);
    identity.evidence.push(relative);
    await persistIdentity(identity);
  };
  const cleanupCrunOwned = async (mediaKind, resource, end) => {
    requireThat(
      ['image', 'video'].includes(mediaKind) &&
        identity.resources.crun?.[mediaKind] === resource &&
        resource.mediaKind === mediaKind,
      'CRUN_OWNERSHIP',
    );
    const pgCleanup = (args) => {
      const invocation = postgresClientInvocation(
        serviceId(identity.resources.postgres),
        args,
        credentials,
      );
      return cleanupCapture(
        'docker',
        invocation.args,
        identity.repo,
        {
          ...privateEnv,
          ...invocation.env,
        },
        Math.max(1, end - Date.now()),
      );
    };
    const redisCleanup = (operation, keys) =>
      cleanupCapture(
        'docker',
        [
          'exec',
          serviceId(identity.resources.redis),
          'redis-cli',
          '-n',
          '11',
          operation,
          ...keys,
        ],
        identity.repo,
        privateEnv,
        Math.max(1, end - Date.now()),
      );
    return cleanupFinalCrunResources(
      resource,
      {
        save: (manifest) =>
          save(`raw/crun-${mediaKind}-manifest.json`, JSON.stringify(manifest)),
        dropSchema: (schema) =>
          pgCleanup([
            '-d',
            'genfeed_crun_test',
            '-v',
            'ON_ERROR_STOP=1',
            '-c',
            `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
          ]),
        schemaAbsent: (schema) =>
          pgCleanup([
            '-d',
            'genfeed_crun_test',
            '-tAc',
            `SELECT 1 FROM pg_namespace WHERE nspname = '${schema}'`,
          ]),
        deleteKeys: (keys) => redisCleanup('DEL', keys),
        keysAbsent: (keys) => redisCleanup('EXISTS', keys),
      },
      end,
    );
  };
  const learningSnapshot = async (end) => {
    const id = identity.resources.redis;
    requireThat(HASH.test(id ?? ''), 'LEARNING_CONTAINER_IDENTITY');
    const command = (...args) => {
      requireThat(Date.now() < end, 'LEARNING_PHASE_DEADLINE');
      return cleanupCapture(
        'docker',
        ['exec', id, 'redis-cli', ...args],
        identity.repo,
        privateEnv,
        Math.min(5000, end - Date.now()),
      );
    };
    requireThat(Date.now() < end, 'LEARNING_PHASE_DEADLINE');
    const inspected = JSON.parse(
      await cleanupCapture(
        'docker',
        ['inspect', id],
        identity.repo,
        privateEnv,
        Math.min(5000, end - Date.now()),
      ),
    );
    requireThat(
      Array.isArray(inspected) && inspected.length === 1,
      'LEARNING_CONTAINER_IDENTITY',
    );
    const inside = await command('INFO', 'server');
    const endpoint = await learningEndpointInfo(end - Date.now());
    const receipt = buildLearningRedisReceipt(
      identity,
      env,
      inspected[0],
      inside,
      endpoint,
    );
    const keyspace = await command('INFO', 'keyspace');
    const sizes = [];
    for (const db of [0, 1, 2, 3, 4])
      sizes.push(await command('-n', String(db), 'DBSIZE'));
    requireLearningRedisBlank(keyspace, sizes);
    return { receipt, inspected: inspected[0], keyspace, sizes };
  };
  const verifyLearningStoppedAndBlank = (end) =>
    verifyFinalLearningCleanup(
      identity,
      { snapshot: learningSnapshot, save },
      end,
    );
  const run = async (
    stage,
    executable,
    args,
    cwd,
    extra,
    timeout,
    grace = 10000,
  ) => {
    requireThat(!cancelled, 'CANCELLED');
    requireThat(
      Date.now() + grace + 15000 < Math.min(deadline, phaseDeadline),
      'AGGREGATE_DEADLINE',
    );
    await diskGuard(identity.repo);
    const stdoutPath = path.join(
      identity.state,
      `raw/${stage}-${commands.length}.stdout`,
    );
    const stderrPath = path.join(
      identity.state,
      `raw/${stage}-${commands.length}.stderr`,
    );
    identity.evidence.push(
      path.relative(identity.state, stdoutPath),
      path.relative(identity.state, stderrPath),
    );
    await persistIdentity(identity);
    const mediaKind = Object.hasOwn(CRUN_STAGE_MEDIA, stage)
      ? CRUN_STAGE_MEDIA[stage]
      : undefined;
    const crunResource = mediaKind
      ? identity.resources.crun?.[mediaKind]
      : undefined;
    const childEnv =
      stage === 'learning-runtime' ? { ...extra } : { ...privateEnv, ...extra };
    const result =
      stage === 'learning-runtime'
        ? await runFinalLearningBounded({
            identity,
            resource: identity.resources.learning,
            executable,
            args,
            cwd,
            env: childEnv,
            stdoutPath,
            stderrPath,
            persistProof: persistIdentity,
            cleanupOwned: verifyLearningStoppedAndBlank,
            aggregateDeadline: Math.min(deadline, phaseDeadline),
          })
        : identity.group === 'final' && mediaKind !== undefined
          ? await runFinalCrunBounded({
              identity,
              mediaKind,
              resource: crunResource,
              executable,
              args,
              cwd,
              env: childEnv,
              stdoutPath,
              stderrPath,
              persistProof: persistIdentity,
              cleanupOwned: (end) =>
                cleanupCrunOwned(mediaKind, crunResource, end),
              aggregateDeadline: Math.min(deadline, phaseDeadline),
            })
          : await runBounded({
              executable,
              args,
              cwd,
              env: childEnv,
              stdoutPath,
              stderrPath,
              timeoutMs: Math.min(
                timeout,
                Math.min(deadline, phaseDeadline) - Date.now(),
              ),
              graceMs: grace,
            });
    commands.push({ stage, ...result });
    requireThat(
      result.exitCode === 0 &&
        !result.signal &&
        !result.timedOut &&
        !result.outputLimit &&
        !result.spawnError &&
        !result.streamError &&
        !result.cleanupError,
      'CHILD_FAILED',
    );
    return { result, stdoutPath };
  };
  const vitest = async (
    stage,
    contracts,
    {
      cwd = 'apps/server/api',
      config = 'vitest.config.ts',
      heap = 2048,
      extra = {},
      timeout = 165000,
      pattern,
      selectionIndex,
      pool,
    } = {},
  ) => {
    const reportRelative = `raw/${stage}.report.json`;
    const reportPath = path.join(identity.state, reportRelative);
    identity.evidence.push(reportRelative);
    await persistIdentity(identity);
    const args = [
      `--max-old-space-size=${heap}`,
      path.join(identity.repo, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      config,
      '--maxWorkers=1',
      '--no-file-parallelism',
      ...privateVitestReporterArguments(reportPath),
      '--passWithNoTests=false',
      ...contracts.map((entry) => entry.file),
    ];
    if (pattern) args.push('--testNamePattern', pattern);
    if (pool) args.push(`--pool=${pool}`);
    let child;
    let failure;
    try {
      child = await run(
        stage,
        process.execPath,
        args,
        path.join(identity.repo, cwd),
        { ...extra, NODE_OPTIONS: `--max-old-space-size=${heap}` },
        timeout,
      );
    } catch (error) {
      failure = error;
    } finally {
      try {
        const metadata = await lstat(reportPath);
        requireThat(
          metadata.isFile() && !metadata.isSymbolicLink(),
          'UNSAFE_REPORT',
        );
        await chmod(reportPath, 0o600);
      } catch (error) {
        if (error.code !== 'ENOENT') failure ??= error;
      }
    }
    if (failure) throw failure;
    const { result, stdoutPath } = child;
    const report = JSON.parse(await safeFile(identity.state, reportRelative));
    const cases =
      selectionIndex == null
        ? validateReport(report, contracts, result)
        : validateVisualSelection(report, selectionIndex, result);
    completed.push({ stage, cases });
    return readFile(stdoutPath, 'utf8');
  };
  const database = async (name) => {
    if (identity.group === 'final')
      return createFinalOwnedDatabase(identity, name, {
        credentials,
        persist: persistIdentity,
        absent: (database, id) => {
          const invocation = postgresClientInvocation(
            id,
            [
              '-d',
              'test',
              '-tAc',
              `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
            ],
            credentials,
          );
          return capture('docker', invocation.args, identity.repo, {
            ...privateEnv,
            ...invocation.env,
          });
        },
        create: (database, id) => {
          const invocation = postgresClientInvocation(
            id,
            [
              '-d',
              'test',
              '-v',
              'ON_ERROR_STOP=1',
              '-c',
              `CREATE DATABASE "${database}"`,
            ],
            credentials,
          );
          return capture('docker', invocation.args, identity.repo, {
            ...privateEnv,
            ...invocation.env,
          });
        },
      });
    const url = databaseUrl(name, credentials);
    validateUrl(url, 'postgres', name, credentials);
    const id = serviceId(identity.resources.postgres);
    const exists = await capture(
      'docker',
      postgresClientInvocation(
        id,
        [
          '-d',
          'test',
          '-tAc',
          `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
        ],
        credentials,
      ).args,
      identity.repo,
      { ...privateEnv, ...postgresClientInvocation(id, [], credentials).env },
    );
    requireThat(exists === '', 'DATABASE_ALREADY_EXISTS');
    identity.resources.databases.push({ name, created: false });
    await persistIdentity(identity);
    await capture(
      'docker',
      postgresClientInvocation(
        id,
        [
          '-d',
          'test',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `CREATE DATABASE "${name}"`,
        ],
        credentials,
      ).args,
      identity.repo,
      { ...privateEnv, ...postgresClientInvocation(id, [], credentials).env },
    );
    identity.resources.databases.at(-1).created = true;
    await persistIdentity(identity);
    return url;
  };
  const migrate = async (stage, url) => {
    await run(
      stage,
      'bun',
      ['x', 'prisma', 'migrate', 'deploy'],
      path.join(identity.repo, 'packages/prisma'),
      { DATABASE_URL: url },
      570000,
    );
    completed.push({ stage });
  };
  const attempt = async (stage, work) => {
    try {
      await work();
    } catch (error) {
      failures.push({ stage, code: error.code ?? 'EXECUTION_FAILED' });
    }
  };
  let coordinator;
  let outcome;
  const visualRetry = new Map();
  const cleanupResult = { passed: true, operations: [] };
  try {
    workBudget(identity);
    requireThat(
      (await head(identity.repo)) === identity.candidateSHA,
      'CHECKOUT_MISMATCH',
    );
    if (identity.group === 'visual-connected') {
      for (const [kind, image, port] of [
        ['postgres', 'pgvector/pgvector:pg17', '5432'],
      ]) {
        const name = `runtime-acceptance-${kind}-${randomUUID()}`;
        identity.resources.containers.push({ name, id: null });
        await persistIdentity(identity);
        const args = [
          'run',
          '-d',
          '--name',
          name,
          '-p',
          `127.0.0.1:${port}:${port}`,
        ];
        if (kind === 'postgres')
          args.push(
            '--env',
            'POSTGRES_USER',
            '--env',
            'POSTGRES_PASSWORD',
            '--env',
            'POSTGRES_DB',
          );
        args.push(image);
        const id = serviceId(
          await capture(
            'docker',
            args,
            identity.repo,
            kind === 'postgres'
              ? {
                  ...privateEnv,
                  POSTGRES_USER: credentials.username,
                  POSTGRES_PASSWORD: credentials.password,
                  POSTGRES_DB: 'test',
                }
              : privateEnv,
            120000,
          ),
        );
        identity.resources.containers.at(-1).id = id;
        identity.resources[kind] = id;
        await persistIdentity(identity);
      }
      for (let index = 0; index < 60; index++) {
        try {
          await capture(
            'docker',
            [
              'exec',
              identity.resources.postgres,
              'pg_isready',
              '-U',
              'genfeed',
              '-d',
              'test',
            ],
            identity.repo,
            privateEnv,
          );
          break;
        } catch {
          requireThat(index < 59, 'SERVICE_NOT_READY');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } else if (identity.group !== 'visual-isolation') {
      identity.resources.postgres = serviceId(
        env.RUNTIME_ACCEPTANCE_POSTGRES_ID,
      );
      if (identity.group === 'final')
        identity.resources.redis = serviceId(env.RUNTIME_ACCEPTANCE_REDIS_ID);
      await persistIdentity(identity);
    }
    if (identity.resources.postgres)
      serviceVersions.postgres = await capture(
        'docker',
        postgresClientInvocation(
          identity.resources.postgres,
          ['-d', 'test', '-tAc', 'SHOW server_version'],
          credentials,
        ).args,
        identity.repo,
        {
          ...privateEnv,
          ...postgresClientInvocation(
            identity.resources.postgres,
            [],
            credentials,
          ).env,
        },
      );
    if (identity.resources.redis)
      serviceVersions.redis = await capture(
        'docker',
        ['exec', identity.resources.redis, 'redis-cli', 'INFO', 'server'],
        identity.repo,
        privateEnv,
      );
    if (identity.group === 'final') {
      const contract = requireLearningSourceContract();
      await verifyFrozenSources(identity.repo, contract.sourceInputs);
      const startedAt = Date.now();
      requireThat(
        startedAt + FINAL_LEARNING_BUDGET.total <= deadline,
        'AGGREGATE_DEADLINE',
      );
      identity.resources.learning = {
        startedAt,
        candidateSHA: identity.candidateSHA,
        controlSHA: identity.controlSHA,
        directory: path.join(identity.state, 'raw/learning-runtime'),
        receiptRelative: 'raw/learning-runtime/redis-ownership.json',
      };
      const resource = identity.resources.learning;
      resource.receiptPath = path.join(
        identity.state,
        resource.receiptRelative,
      );
      await persistIdentity(identity);
      await mkdir(resource.directory, { mode: 0o700 });
      const directory = await lstat(resource.directory);
      resource.directoryMetadata = {
        inode: directory.ino,
        device: directory.dev,
      };
      await persistIdentity(identity);
      const snapshot = await learningSnapshot(startedAt + 30000);
      resource.receipt = snapshot.receipt;
      const serialized = JSON.stringify(resource.receipt);
      await save(resource.receiptRelative, serialized);
      resource.receiptHash = sha256(serialized);
      const metadata = await lstat(resource.receiptPath);
      resource.receiptMetadata = { inode: metadata.ino, device: metadata.dev };
      await save(
        'raw/learning-runtime-container.json',
        JSON.stringify(snapshot.inspected),
      );
      await persistIdentity(identity);
      const runtimeUrl = await database('genfeed_learning_runtime_test');
      const racesUrl = await database('genfeed_learning_races_test');
      await vitest('learning-runtime', contract.suites, {
        config: 'vitest.learning-runtime.config.ts',
        pool: 'forks',
        extra: learningChildEnvironment(env, identity, resource, {
          runtimeUrl,
          racesUrl,
        }),
        timeout: Math.max(
          1,
          startedAt + FINAL_LEARNING_BUDGET.work - Date.now(),
        ),
      });
      requireThat(
        resource.blankVerified &&
          resource.cleanupResult?.passed &&
          hasFinalLearningTerminationProof(resource),
        'LEARNING_CLEANUP_REQUIRED',
      );
    }
    if (
      [
        'final',
        'dataset-diagnostic',
        'dataset-smoke',
        'dataset-scale',
      ].includes(identity.group)
    )
      await attempt('dataset', async () => {
        const url = await database('genfeed_dataset_5781_test');
        const datasetEnv = datasetChildEnvironment(url);
        const correctnessDeadline = Date.now() + 330000;
        await vitest(
          'dataset-correctness',
          [
            { file: DATASET_UNIT, count: 23 },
            {
              file: DATASET_PG,
              count: 10,
              titles: PG_TITLES,
              skipped: [MATRIX_TITLE, DIAGNOSTIC_TITLE, SMOKE_TITLE],
            },
          ],
          {
            heap: 4096,
            extra: datasetEnv,
            timeout: correctnessDeadline - Date.now(),
          },
        );
        const config = path.join(
          identity.repo,
          `apps/server/api/.runtime-acceptance-${randomUUID()}.json`,
        );
        try {
          await privateFile(
            config,
            JSON.stringify({
              extends: './tsconfig.typecheck.specs.json',
              include: [],
              exclude: [],
              files: [
                'learning-dataset.service.ts',
                'learning-dataset-graph.service.ts',
                'learning-dataset.service.spec.ts',
                'learning-dataset.postgres.spec.ts',
              ].map((file) =>
                path.join(
                  identity.repo,
                  'apps/server/api',
                  DATASET_DIRECTORY,
                  file,
                ),
              ),
            }),
          );
          await run(
            'dataset-typecheck',
            process.execPath,
            [
              '--max-old-space-size=4096',
              path.join(identity.repo, 'node_modules/typescript/bin/tsc'),
              '--noEmit',
              '-p',
              config,
            ],
            identity.repo,
            { NODE_OPTIONS: '--max-old-space-size=4096' },
            correctnessDeadline - Date.now(),
          );
          completed.push({ stage: 'dataset-typecheck' });
        } finally {
          await rm(config, { force: true });
        }
        const diagnostic = identity.group === 'dataset-diagnostic';
        const smoke = ['final', 'dataset-smoke'].includes(identity.group);
        const stage = diagnostic
          ? 'dataset-diagnostic'
          : smoke
            ? 'dataset-smoke'
            : 'dataset-matrix';
        const selectedTitle = diagnostic
          ? DIAGNOSTIC_TITLE
          : smoke
            ? SMOKE_TITLE
            : MATRIX_TITLE;
        const measuredUrl = await database(
          diagnostic
            ? 'genfeed_dataset_5781_profile_test'
            : 'genfeed_dataset_5781_matrix_test',
        );
        const stdout = await vitest(
          stage,
          [
            {
              file: DATASET_PG,
              count: 1,
              titles: [selectedTitle],
              skipped: [
                ...PG_TITLES,
                ...[MATRIX_TITLE, DIAGNOSTIC_TITLE, SMOKE_TITLE].filter(
                  (title) => title !== selectedTitle,
                ),
              ],
            },
          ],
          {
            heap: 4096,
            extra: {
              ...datasetEnv,
              LEARNING_DATASET_TEST_DATABASE_URL: measuredUrl,
              ...(diagnostic
                ? { LEARNING_DATASET_PROFILE: '1' }
                : smoke
                  ? { LEARNING_DATASET_SMOKE: '1' }
                  : { LEARNING_DATASET_BENCHMARK: '1' }),
            },
            timeout: diagnostic || smoke ? 330000 : 1170000,
            pattern: diagnostic
              ? 'profiles one 10k and one 100k consented snapshot'
              : smoke
                ? 'checks one 10k owned, consented and mixed'
                : 'measures 1k/10k/100k',
          },
        );
        const records = parseDatasetRecords(
          stdout,
          diagnostic ? 'diagnostic' : smoke ? 'smoke' : 'matrix',
        );
        await save(`raw/${stage}.records.json`, JSON.stringify(records));
      });
    if (identity.group === 'final') {
      const contract = validateOwnerContract(ownerContractFrom(env));
      await attempt('brand', async () => {
        const url = await database('genfeed_4617_ed1f_test');
        const brandEnv = { BRANDED_GENERATION_TEST_DATABASE_URL: url };
        const preparationDeadline = Date.now() + 570000;
        for (const command of ['db:validate', 'db:generate', 'db:migrate'])
          await run(
            'brand-preparation',
            'bun',
            ['run', command],
            path.join(identity.repo, 'packages/prisma'),
            { DATABASE_URL: url },
            preparationDeadline - Date.now(),
          );
        completed.push({ stage: 'brand-preparation' });
        await vitest(
          'brand-migration',
          [{ file: 'prisma/branded-generation-receipt-migration.test.ts' }],
          { cwd: 'packages/prisma', extra: brandEnv, timeout: 105000 },
        );
        // The owner contract freezes integration cases; unit suites still require
        // nonzero execution and reject every skip in each collected file.
        const units = SERIAL_BRAND_UNITS.map((file) => ({ file }));
        await vitest('brand-units', units, {
          extra: brandEnv,
          timeout: 105000,
        });
        await vitest(
          'brand-contracts',
          [
            {
              file: 'src/api-types/contracts/branded-generation.contract.test.ts',
            },
          ],
          { cwd: 'packages/contracts', extra: brandEnv, timeout: 45000 },
        );
        await vitest(
          'brand-serializers',
          [{ file: '__tests__/branded-generation-receipt.serializer.test.ts' }],
          { cwd: 'packages/serializers', extra: brandEnv, timeout: 45000 },
        );
      });
      await attempt('baseline-materialization-migration', async () => {
        requireThat(Date.now() + 60000 < deadline, 'AGGREGATE_DEADLINE');
        const ledger = await executeDedicatedAcceptance(identity, env, true);
        commands.push(...ledger.commands);
        requireThat(
          ledger.status === 'passed',
          ledger.failures[0]?.code ?? 'BASELINE_CLEANUP_FAILED',
        );
        completed.push({
          stage: 'baseline-materialization-migration',
          sourceCases: 2,
          postgresCases: 5,
          cases: ledger.completed.find(
            (item) => item.stage === 'baseline-materialization-migration',
          )?.cases,
        });
      });
      await attempt('storage', () =>
        vitest(
          'storage',
          contract.storage.map((entry) => ({
            file: entry.path.slice('packages/storage/'.length),
            titles: entry.passedTitles,
          })),
          { cwd: 'packages/storage', timeout: 165000 },
        ),
      );
      identity.resources.crun = { image: null, video: null };
      await persistIdentity(identity);
      const crunDatabase = createFinalCrunDatabaseAllocator(database);
      for (const mediaKind of ['image', 'video']) {
        const stage = `crun-${mediaKind}`;
        const priorFailures = failures.length;
        await attempt(stage, async () => {
          const contract = CRUN_SOURCE_CONTRACT[mediaKind];
          await verifyFrozenSources(identity.repo, [contract]);
          const url = await crunDatabase();
          const redis = 'redis://127.0.0.1:6379/11';
          validateUrl(redis, 'redis');
          const uuid = randomUUID();
          const manifest = `/tmp/crun-run-${uuid}.json`;
          const directory = `/tmp/crun-owned-${uuid}`;
          const resource = { mediaKind, uuid, manifest, directory };
          const other =
            identity.resources.crun[mediaKind === 'image' ? 'video' : 'image'];
          requireThat(
            !other ||
              (other.uuid !== uuid &&
                other.manifest !== manifest &&
                other.directory !== directory),
            'CRUN_OWNERSHIP',
          );
          identity.resources.crun[mediaKind] = resource;
          await persistIdentity(identity);
          await mkdir(directory, { mode: 0o700 });
          await privateFile(
            manifest,
            JSON.stringify({
              version: 1,
              schema: null,
              ownedDirectory: directory,
              redisKeys: [],
            }),
          );
          for (const [key, target] of [
            ['manifest', manifest],
            ['directory', directory],
          ]) {
            const metadata = await lstat(target);
            resource[`${key}Metadata`] = {
              device: metadata.dev,
              inode: metadata.ino,
              realpath: await realpath(target),
            };
          }
          await persistIdentity(identity);
          await vitest(
            stage,
            [
              {
                file: contract.path.slice('apps/server/api/'.length),
                count: contract.count,
                titles: contract.passedTitles,
              },
            ],
            {
              pool: 'forks',
              extra: {
                WORKFLOW_BILLING_TEST_DATABASE_URL: url,
                CRUN_TEST_REDIS_URL: redis,
                CRUN_TEST_RUN_MANIFEST: manifest,
                CRUN_TEST_OWNED_DIRECTORY: directory,
              },
              timeout: 60000,
            },
          );
        });
        if (failures.length !== priorFailures) break;
      }
      await attempt('agent', async () => {
        const url = await database('genfeed_agent_test');
        const redis = 'redis://127.0.0.1:6379/12';
        validateUrl(redis, 'redis');
        await migrate('agent-preparation', url);
        const extra = { DATABASE_URL: url, REDIS_URL: redis };
        await vitest(
          'agent',
          [
            {
              file: 'test/integration/proactive-agent-runs.integration.spec.ts',
              count: 6,
              titles: AGENT_TITLES,
            },
          ],
          { config: 'vitest.config.e2e.ts', extra },
        );
        completed.find((entry) => entry.stage === 'agent').coverage =
          'scheduler-custom-turn-regression';
        await vitest('publisher', PUBLISHER_CONTRACTS, {
          config: 'vitest.config.e2e.ts',
          extra,
        });
      });
    }
    if (identity.group === 'visual-isolation')
      await attempt('visual-isolation', async () => {
        requireThat(Date.now() <= identity.setupDeadline, 'SETUP_DEADLINE');
        const directory = path.join(identity.state, 'raw/isolation');
        await mkdir(directory, { mode: 0o700 });
        const extra = {
          VISUAL_CODE_ARTIFACT_DIR: directory,
          VISUAL_CODE_ACCEPTANCE_HEAD: identity.candidateSHA,
          FFMPEG_BIN: '/usr/bin/ffmpeg',
        };
        serviceVersions.runsc = await capture(
          'runsc',
          ['--version'],
          identity.repo,
          privateEnv,
        );
        const protocolFiles = (
          await readdir(path.join(identity.repo, 'scripts/visual-code'))
        )
          .filter((file) => file.endsWith('.test.mjs'))
          .map((file) => `scripts/visual-code/${file}`);
        requireThat(protocolFiles.length > 0, 'MISSING_VISUAL_PROTOCOL');
        phaseDeadline = identity.startedAt + 480000;
        const protocol = await run(
          'visual-protocol',
          process.execPath,
          ['--test', '--test-reporter=tap', ...protocolFiles],
          identity.repo,
          extra,
          180000,
          0,
        );
        const totals = parseProtocolTotals(
          await readFile(protocol.stdoutPath, 'utf8'),
          protocol.result,
        );
        completed.push({ stage: 'visual-protocol', totals });
        phaseDeadline = identity.startedAt + 1380000;
        await run(
          'visual-isolation',
          process.execPath,
          ['scripts/visual-code/isolation-acceptance.mjs'],
          identity.repo,
          extra,
          900000,
          0,
        );
        completed.push({ stage: 'visual-isolation' });
      });
    if (identity.group === 'visual-connected')
      await attempt('visual', async () => {
        const template = 'genfeed_visual_template_test';
        const url = await database(template);
        await migrate('visual-preparation', url);
        const visualRoot = path.join(identity.state, 'raw/visual');
        for (const directory of [
          '',
          'artifacts',
          'media',
          'renderers',
          'supervisor',
        ])
          await mkdir(path.join(visualRoot, directory), { mode: 0o700 });
        const observed = {
          gitHead: identity.candidateSHA,
          platform: process.platform,
          nodeVersion: process.version,
          ffmpegVersion: (
            await capture(
              '/usr/bin/ffmpeg',
              ['-version'],
              identity.repo,
              privateEnv,
            )
          ).split('\n')[0],
          ffprobeVersion: (
            await capture('ffprobe', ['-version'], identity.repo, privateEnv)
          ).split('\n')[0],
          runscVersion: (
            await capture('runsc', ['--version'], identity.repo, privateEnv)
          ).split('\n')[0],
          imageId: await capture(
            'docker',
            [
              'image',
              'inspect',
              'genfeed-visual-code:4.0.530',
              '--format',
              '{{.Id}}',
            ],
            identity.repo,
            privateEnv,
          ),
          dockerRuntime: 'runsc',
          rendererVersion: '4.0.530',
        };
        await verifyVisualRuntimeProbe(
          capture,
          identity.repo,
          privateEnv,
          observed.imageId,
        );
        await privateFile(
          path.join(visualRoot, 'runtime-preflight.json'),
          JSON.stringify(observed),
        );
        await run(
          'visual-media',
          process.execPath,
          [
            'scripts/visual-code/create-fixture-media.mjs',
            path.join(visualRoot, 'media'),
          ],
          identity.repo,
          { FFMPEG_BIN: '/usr/bin/ffmpeg' },
          120000,
        );
        const renderless = visualSelection(0);
        await vitest('visual-renderless', [renderless], {
          config: 'vitest.config.e2e.ts',
          pattern: renderless.pattern,
          extra: { VISUAL_CODE_LOCAL_ACCEPTANCE: undefined },
          selectionIndex: 0,
          timeout: 60000,
        });
        requireThat(Date.now() <= identity.setupDeadline, 'SETUP_DEADLINE');
        phaseDeadline = identity.startedAt + 5820000;
        const caseLedgers = [];
        const makeAdapters = (caseInfo, library = false) => {
          const key = library
            ? 'library'
            : `case-${String(caseInfo.index).padStart(2, '0')}`;
          const root = path.join(visualRoot, 'artifacts', key);
          const rendererRoot = path.join(visualRoot, 'renderers', key);
          const reportRelative = `raw/visual/supervisor/${key}.report.json`;
          const reportPath = path.join(identity.state, reportRelative);
          const token = randomBytes(32).toString('hex');
          let renderer;
          let testChild;
          const quiet = async (args, end, additions = {}) => {
            const result = await visualQuietCommand(
              'docker',
              args,
              identity.repo,
              { ...privateEnv, ...additions },
              end,
            );
            requireThat(
              result.exitCode === 0 && !result.signal && !result.capped,
              'VISUAL_RESOURCE_COMMAND',
            );
            return result.stdout;
          };
          const pg = async (args, end) => {
            const invocation = postgresClientInvocation(
              identity.resources.postgres,
              args,
              credentials,
            );
            return quiet(invocation.args, end, invocation.env);
          };
          const persist = async (ledger) => {
            visualRetry.set(key, { ledger, adapters });
            ledger.candidateSHA = identity.candidateSHA;
            ledger.controlSHA = identity.controlSHA;
            ledger.artifactRoot = root;
            ledger.rendererRoot = rendererRoot;
            await persistVisualJournal(ledger, () =>
              atomicJson(
                path.join(visualRoot, 'supervisor', `${key}.json`),
                ledger,
              ),
            );
          };
          const inspect = async (name, end) => {
            const result = await visualQuietCommand(
              'docker',
              ['container', 'inspect', name],
              identity.repo,
              privateEnv,
              end,
            );
            if (result.exitCode !== 0) {
              requireThat(
                !result.signal &&
                  !result.capped &&
                  /^Error response from daemon: No such (?:container|object):/.test(
                    result.stderr,
                  ),
                'CONTAINER_ABSENCE_UNCONFIRMED',
              );
              return null;
            }
            const values = JSON.parse(result.stdout);
            requireThat(
              Array.isArray(values) && values.length === 1,
              'CONTAINER_OWNERSHIP',
            );
            return values[0];
          };
          const removeExact = async (name, end, ownership) => {
            const lookup = ownership?.id ?? name;
            const found = await inspect(lookup, end);
            if (found) {
              requireThat(
                found.Name === `/${name}` && /^[a-f0-9]{64}$/.test(found.Id),
                'CONTAINER_OWNERSHIP',
              );
              if (ownership)
                requireThat(
                  found.Config?.Labels?.['genfeed.runtime-acceptance'] ===
                    ownership.label &&
                    (!ownership.id || found.Id === ownership.id),
                  'CONTAINER_OWNERSHIP',
                );
              await quiet(['rm', '--force', found.Id], end);
            }
            requireThat(
              (await inspect(lookup, end)) === null,
              'CONTAINER_REMOVAL_UNCONFIRMED',
            );
            return found?.Id ?? null;
          };
          const adapters = {
            persist,
            cancelled: () => cancelled,
            async allocate(ledger, end) {
              requireThat(!cancelled, 'CANCELLED');
              const dbName = library
                ? 'genfeed_visual_library_test'
                : `genfeed_visual_case_${String(caseInfo.index).padStart(2, '0')}_test`;
              ledger.resources.database = { name: dbName, created: false };
              ledger.resources.redis = {
                name: `runtime-visual-${ledger.nonce}`,
                id: null,
                label: ledger.nonce,
              };
              ledger.resources.coordinator = { pid: null };
              await persist(ledger);
              for (const directory of [root, rendererRoot]) {
                await mkdir(directory, { mode: 0o700 });
                const metadata = await lstat(directory);
                ledger.resources[path.basename(path.dirname(directory))] = {
                  path: directory,
                  device: metadata.dev,
                  inode: metadata.ino,
                  realpath: await realpath(directory),
                };
              }
              await privateFile(
                path.join(root, 'runtime-preflight.json'),
                JSON.stringify(observed),
              );
              await persist(ledger);
              requireThat(
                (await pg(
                  [
                    '-d',
                    'test',
                    '-tAc',
                    `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
                  ],
                  end,
                )) === '',
                'DATABASE_ALREADY_EXISTS',
              );
              ledger.resources.database.creationAuthorized = true;
              await persist(ledger);
              // Intent is private before allocation; cleanup also checks an interrupted response.
              await pg(
                [
                  '-d',
                  'test',
                  '-v',
                  'ON_ERROR_STOP=1',
                  '-c',
                  `CREATE DATABASE "${dbName}" TEMPLATE "${template}"`,
                ],
                end,
              );
              ledger.resources.database.created = true;
              await persist(ledger);
              await requirePortAbsent(6379);
              await requirePortAbsent(8789);
              const owned = ledger.resources.redis;
              owned.id = serviceId(
                await quiet(
                  [
                    'run',
                    '-d',
                    '--name',
                    owned.name,
                    '--label',
                    `genfeed.runtime-acceptance=${owned.label}`,
                    '-p',
                    '127.0.0.1:6379:6379',
                    'redis:7',
                  ],
                  end,
                ),
              );
              identity.resources.containers.push(owned);
              await persistIdentity(identity);
              await persist(ledger);
              while (true) {
                const ready = await visualQuietCommand(
                  'docker',
                  ['exec', owned.id, 'redis-cli', 'ping'],
                  identity.repo,
                  privateEnv,
                  end,
                );
                if (ready.exitCode === 0 && ready.stdout === 'PONG') break;
                requireThat(Date.now() + 100 < end, 'VISUAL_WORK_TIMEOUT');
                await realClock.sleep(100);
              }
              renderer = await startVisualProcess({
                executable: process.execPath,
                args: ['scripts/visual-code/coordinator.mjs'],
                cwd: identity.repo,
                env: {
                  ...privateEnv,
                  VISUAL_CODE_STATE_DIR: rendererRoot,
                  VISUAL_CODE_RENDERER_TOKEN: token,
                },
                stdoutPath: path.join(
                  visualRoot,
                  'supervisor',
                  `${key}.coordinator.stdout`,
                ),
                stderrPath: path.join(
                  visualRoot,
                  'supervisor',
                  `${key}.coordinator.stderr`,
                ),
              });
              ledger.resources.coordinator.pid = renderer.pid;
              await persist(ledger);
              while (true) {
                requireThat(
                  Date.now() < end && !cancelled,
                  'VISUAL_WORK_TIMEOUT',
                );
                try {
                  const response = await fetch('http://127.0.0.1:8789/health', {
                    headers: { authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(
                      Math.min(1000, end - Date.now()),
                    ),
                  });
                  if (
                    response.ok &&
                    (await response.json()).rendererVersion === '4.0.530'
                  )
                    break;
                } catch {}
                await realClock.sleep(100);
              }
            },
            async startChild(ledger) {
              const selection = visualSelection(caseInfo.index);
              const file = library
                ? 'test/integration/visual-code/visual-code-library.integration.spec.ts'
                : VISUAL_SPEC;
              const args = [
                '--max-old-space-size=2048',
                path.join(identity.repo, 'node_modules/vitest/vitest.mjs'),
                'run',
                '--config',
                'vitest.config.e2e.ts',
                '--maxWorkers=1',
                '--no-file-parallelism',
                ...privateVitestReporterArguments(reportPath),
                '--passWithNoTests=false',
                file,
              ];
              if (!library) args.push('--testNamePattern', selection.pattern);
              testChild = await startVisualProcess({
                executable: process.execPath,
                args,
                cwd: path.join(identity.repo, 'apps/server/api'),
                env: {
                  ...privateEnv,
                  DATABASE_URL: databaseUrl(
                    ledger.resources.database.name,
                    credentials,
                  ),
                  REDIS_URL: 'redis://127.0.0.1:6379/13',
                  VISUAL_CODE_LOCAL_ACCEPTANCE: '1',
                  VISUAL_CODE_LOCAL_RENDERER_URL: 'http://127.0.0.1:8789',
                  VISUAL_CODE_LOCAL_RENDERER_TOKEN: token,
                  VISUAL_CODE_LOCAL_REDIS_URL: 'redis://127.0.0.1:6379/13',
                  VISUAL_CODE_LOCAL_ARTIFACT_DIR: root,
                  VISUAL_CODE_LOCAL_MEDIA_DIR: path.join(visualRoot, 'media'),
                  FFMPEG_BIN: '/usr/bin/ffmpeg',
                },
                stdoutPath: path.join(
                  visualRoot,
                  'supervisor',
                  `${key}.stdout`,
                ),
                stderrPath: path.join(
                  visualRoot,
                  'supervisor',
                  `${key}.stderr`,
                ),
              });
              ledger.resources.child = { pid: testChild.pid };
              await persist(ledger);
              return testChild;
            },
            marker: () =>
              library
                ? Promise.resolve(null)
                : visualScenarioReceipt(identity, root, caseInfo.scenario),
            async stopGroups(ledger, limits) {
              await stopVisualGroups(
                [
                  ledger.resources.child?.pid,
                  ledger.resources.coordinator?.pid,
                ],
                limits,
              );
              if (renderer)
                await untilDeadline(
                  renderer.done,
                  limits.deadline,
                  realClock,
                  'TERMINATION_UNCONFIRMED',
                );
            },
            async removeRenderers(ledger, end) {
              try {
                const anchor = ledger.resources.renderers;
                if (!anchor) return;
                const metadata = await lstat(rendererRoot);
                requireThat(
                  metadata.isDirectory() &&
                    !metadata.isSymbolicLink() &&
                    metadata.dev === anchor.device &&
                    metadata.ino === anchor.inode &&
                    (await realpath(rendererRoot)) === anchor.realpath,
                  'RENDERER_OWNERSHIP',
                );
                const entries = [];
                for (const file of await readdir(rendererRoot, {
                  withFileTypes: true,
                })) {
                  requireThat(
                    file.isFile() && !file.isSymbolicLink(),
                    'RENDERER_OWNERSHIP',
                  );
                  if (file.name.endsWith('.json'))
                    entries.push({
                      filename: file.name,
                      receipt: JSON.parse(
                        await safeFile(
                          identity.state,
                          path.relative(
                            identity.state,
                            path.join(rendererRoot, file.name),
                          ),
                          65536,
                        ),
                      ),
                    });
                  else
                    requireThat(
                      file.name === 'coordinator.lock' ||
                        /^visual-code-[a-f0-9]{40}\.result$/.test(file.name),
                      'RENDERER_OWNERSHIP',
                    );
                }
                ledger.resources.rendererContainers = rendererContainerNames(
                  entries,
                ).map((name) => ({ name, removed: false }));
                await removeValidatedVisualRenderers(
                  ledger,
                  ledger.resources.rendererContainers,
                  removeExact,
                  persist,
                  end,
                );
              } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                throw new AcceptanceError('RENDERER_OWNERSHIP');
              }
            },
            async removeRedis(ledger, end) {
              const owned = ledger.resources.redis;
              if (!owned) return;
              await removeExact(owned.name, end, owned);
              owned.removed = true;
              await persist(ledger);
            },
            async removeDatabase(ledger, end) {
              const owned = ledger.resources.database;
              if (!owned?.creationAuthorized) return;
              // Only this registered DB is addressed, including recovery after a lost create response.
              await pg(
                [
                  '-d',
                  'test',
                  '-v',
                  'ON_ERROR_STOP=1',
                  '-c',
                  `DROP DATABASE IF EXISTS "${owned.name}" WITH (FORCE)`,
                ],
                end,
              );
              requireThat(
                (await pg(
                  [
                    '-d',
                    'test',
                    '-tAc',
                    `SELECT 1 FROM pg_database WHERE datname = '${owned.name}'`,
                  ],
                  end,
                )) === '',
                'DATABASE_REMOVAL_UNCONFIRMED',
              );
              owned.removed = true;
              await persist(ledger);
            },
            async verifyListeners() {
              await requirePortAbsent(6379);
              await requirePortAbsent(8789);
            },
            async validate(ledger, result) {
              const metadata = await lstat(reportPath);
              requireThat(
                metadata.isFile() && !metadata.isSymbolicLink(),
                'UNSAFE_REPORT',
              );
              await chmod(reportPath, 0o600);
              const contract = library
                ? VISUAL_LIBRARY_CONTRACT
                : visualSelection(caseInfo.index);
              const report = JSON.parse(
                await safeFile(identity.state, reportRelative),
              );
              const selected = library
                ? validateReport(report, [contract], result)
                : validateVisualSelection(report, caseInfo.index, result);
              if (!library) {
                const receipt = await visualScenarioReceipt(
                  identity,
                  root,
                  caseInfo.scenario,
                );
                requireThat(
                  receipt?.outcome === 'passed',
                  'VISUAL_RECEIPT_REQUIRED',
                );
                ledger.receipt = receipt;
                const sources = validateVisualScenarioEvidence(
                  receipt,
                  caseInfo,
                );
                requireThat(
                  receipt.runtimePreflightSha256 ===
                    sha256(
                      await safeFile(
                        identity.state,
                        path.relative(
                          identity.state,
                          path.join(root, 'runtime-preflight.json'),
                        ),
                      ),
                    ) &&
                    Object.keys(observed).every(
                      (key) =>
                        receipt.runtimePreflight?.[key] === observed[key],
                    ),
                  'VISUAL_RECEIPT_IDENTITY',
                );
                ledger.receiptHashes = {
                  evidence: receipt.evidenceSHA256,
                  sources: await verifyVisualScenarioSources(
                    identity,
                    receipt,
                    sources,
                  ),
                };
              } else
                ledger.receipt = {
                  outcome: 'passed',
                  reportSHA256: sha256(
                    await safeFile(identity.state, reportRelative),
                  ),
                };
              return selected;
            },
          };
          return adapters;
        };
        await superviseVisualCases({
          adaptersFor: makeAdapters,
          cumulativeDeadline: phaseDeadline,
          onCase: async (ledger, caseInfo) => {
            caseLedgers.push(ledger);
            commands.push({
              stage: `visual-case-${caseInfo.index}`,
              ...ledger.child,
            });
            if (ledger.status === 'passed')
              completed.push({
                stage: `visual-case-${caseInfo.index}`,
                cases: ledger.cases,
                selected: 1,
                passed: 1,
                selectionExclusions: 10,
              });
            else
              failures.push({
                stage: `visual-case-${caseInfo.index}`,
                code: 'VISUAL_CASE_FAILED',
                failures: ledger.failures,
              });
          },
        });
        phaseDeadline = identity.startedAt + 6000000;
        requireThat(Date.now() < phaseDeadline, 'AGGREGATE_DEADLINE');
        const library = await superviseVisualCase({
          caseInfo: VISUAL_CASES[0],
          adapters: makeAdapters(VISUAL_CASES[0], true),
          cumulativeDeadline: phaseDeadline,
          limits: VISUAL_LIBRARY_LIMITS,
        });
        commands.push({ stage: 'visual-library', ...library.child });
        if (library.status === 'passed')
          completed.push({ stage: 'visual-library', cases: library.cases });
        else
          failures.push({
            stage: 'visual-library',
            code: 'VISUAL_LIBRARY_FAILED',
          });
        requireThat(library.cleanupConfirmed, 'VISUAL_CLEANUP_UNCONFIRMED');
      });
  } catch (error) {
    failures.push({
      stage: 'preparation',
      code: error.code ?? 'PREPARATION_FAILED',
    });
  } finally {
    if (identity.group === 'visual-isolation') {
      try {
        const collected = await collectIsolationEvidence(identity);
        requireThat(
          collected > 0 ||
            !completed.some((entry) => entry.stage === 'visual-isolation'),
          'ISOLATION_EVIDENCE_REQUIRED',
        );
      } catch (error) {
        cleanupResult.passed = false;
        failures.push({
          stage: 'evidence',
          code: error.code ?? 'ISOLATION_EVIDENCE_FAILED',
        });
      }
    }
    if (identity.group === 'visual-connected') {
      for (const { ledger, adapters } of visualRetry.values())
        if (!ledger.cleanupConfirmed) {
          const end = identity.overallDeadline;
          for (const operation of [
            'stopGroups',
            'removeRenderers',
            'removeRedis',
            'removeDatabase',
            'verifyListeners',
          ]) {
            try {
              await untilDeadline(
                operation === 'stopGroups'
                  ? adapters.stopGroups(ledger, {
                      term: 5000,
                      kill: 5000,
                      deadline: end,
                    })
                  : adapters[operation](ledger, end),
                end,
                realClock,
                'VISUAL_CLEANUP_TIMEOUT',
              );
            } catch (error) {
              cleanupResult.passed = false;
              failures.push({
                stage: 'visual-final-cleanup',
                code: error.code ?? 'VISUAL_CLEANUP_FAILED',
              });
            }
          }
        }
      try {
        await collectConnectedEvidence(identity);
      } catch (error) {
        cleanupResult.passed = false;
        failures.push({
          stage: 'evidence',
          code: error.code ?? 'UNSAFE_EVIDENCE_FILE',
        });
      }
    }
    const clean = async (name, operation) => {
      try {
        await operation();
        cleanupResult.operations.push({ name, passed: true });
      } catch {
        cleanupResult.passed = false;
        cleanupResult.operations.push({ name, passed: false });
      }
    };
    if (coordinator?.pid)
      await clean('coordinator', async () => {
        try {
          process.kill(-coordinator.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        await Promise.race([
          new Promise((resolve) => coordinator.once('close', resolve)),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
        try {
          process.kill(-coordinator.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        activeGroups.delete(coordinator.pid);
      });
    if (identity.group === 'final') {
      const learning = identity.resources.learning;
      const learningClean =
        learning?.cleanupResult?.passed === true &&
        learning.blankVerified === true &&
        hasFinalLearningTerminationProof(learning);
      cleanupResult.operations.push({
        name: 'learning-runtime',
        passed: learningClean,
      });
      if (!learningClean) {
        cleanupResult.passed = false;
        failures.push({
          stage: 'learning-runtime',
          code: 'LEARNING_CLEANUP_REQUIRED',
        });
      }
      for (const mediaKind of ['image', 'video']) {
        const result = selectFinalCrunCleanupResult(
          identity,
          commands,
          completed,
          mediaKind,
        );
        if (result === null) continue;
        cleanupResult.operations.push(
          ...result.operations.map((operation) => ({
            ...operation,
            name: `crun-${mediaKind}-${operation.name}`,
          })),
        );
        if (!result.passed) {
          cleanupResult.passed = false;
          failures.push(
            ...result.failures.map((failure) => ({
              ...failure,
              stage: failure.stage.startsWith(`crun-${mediaKind}-`)
                ? failure.stage
                : `crun-${mediaKind}-${failure.stage}`,
            })),
          );
        }
      }
    }
    for (const resource of [...identity.resources.databases].reverse()) {
      const { name, created } = resource;
      if (identity.group === 'final') {
        await clean('database', () =>
          cleanupFinalOwnedDatabase(
            identity,
            resource,
            {
              persist: persistIdentity,
              drop: (database, id) => {
                const invocation = postgresClientInvocation(
                  id,
                  [
                    '-d',
                    'test',
                    '-v',
                    'ON_ERROR_STOP=1',
                    '-c',
                    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
                  ],
                  credentials,
                );
                return cleanupCapture(
                  'docker',
                  invocation.args,
                  identity.repo,
                  { ...privateEnv, ...invocation.env },
                );
              },
              absent: (database, id) => {
                const invocation = postgresClientInvocation(
                  id,
                  [
                    '-d',
                    'test',
                    '-tAc',
                    `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
                  ],
                  credentials,
                );
                return cleanupCapture(
                  'docker',
                  invocation.args,
                  identity.repo,
                  { ...privateEnv, ...invocation.env },
                );
              },
            },
            identity.overallDeadline,
          ),
        );
        continue;
      }
      if (created)
        await clean('database', () =>
          cleanupCapture(
            'docker',
            postgresClientInvocation(
              serviceId(identity.resources.postgres),
              [
                '-d',
                'test',
                '-v',
                'ON_ERROR_STOP=1',
                '-c',
                `DROP DATABASE "${name}" WITH (FORCE)`,
              ],
              credentials,
            ).args,
            identity.repo,
            {
              ...privateEnv,
              ...postgresClientInvocation(
                serviceId(identity.resources.postgres),
                [],
                credentials,
              ).env,
            },
          ),
        );
    }
    for (const container of identity.resources.containers)
      if (!container.removed)
        await clean('container', () =>
          cleanupCapture(
            'docker',
            ['rm', '-f', container.id ?? container.name],
            identity.repo,
            privateEnv,
          ),
        );
    if (
      [
        'final',
        'dataset-diagnostic',
        'dataset-smoke',
        'dataset-scale',
      ].includes(identity.group)
    )
      for (const kind of ['redis', 'postgres'])
        if (identity.resources[kind])
          await clean('service-container', () =>
            cleanupCapture(
              'docker',
              ['rm', '-f', serviceId(identity.resources[kind])],
              identity.repo,
              privateEnv,
            ),
          );
    identity.phase = 'finished';
    await persistIdentity(identity);
    const missing = REQUIRED[identity.group].filter(
      (stage) => !completed.some((entry) => entry.stage === stage),
    );
    if (missing.length > 0)
      failures.push({ stage: 'coverage', code: 'INCOMPLETE_GROUPS' });
    outcome = {
      version: 1,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      group: identity.group,
      status:
        failures.length === 0 && cleanupResult.passed ? 'passed' : 'failed',
      completed,
      failures,
      cleanup: cleanupResult,
      commands,
      runtime: {
        node: process.version,
        platform: process.platform,
        serviceVersions,
      },
    };
    await atomicJson(path.join(identity.state, 'outcome.json'), outcome);
    if (outcome.status === 'passed')
      await privateFile(
        path.join(identity.state, 'receipt.json'),
        JSON.stringify(outcome),
      );
  }
  return outcome;
}
function validateFinalLearningOutcome(outcome, identity) {
  const contract = requireLearningSourceContract();
  const resource = identity.resources.learning;
  requireThat(
    resource?.candidateSHA === identity.candidateSHA &&
      resource.controlSHA === identity.controlSHA &&
      resource.cleanupResult?.passed === true &&
      resource.blankVerified === true &&
      hasFinalLearningTerminationProof(resource) &&
      resource.cleanupEvidence?.length === contract.cleanupReceipts &&
      Number.isSafeInteger(resource.blankCheckedAt) &&
      resource.blankCheckedAt >= resource.terminationProof.checkedAt &&
      outcome.completed[0]?.stage === 'learning-runtime' &&
      outcome.commands[0]?.stage === 'learning-runtime',
    'LEARNING_CLEANUP_REQUIRED',
  );
  const cases = outcome.completed.find(
    (entry) => entry.stage === 'learning-runtime',
  )?.cases;
  requireThat(
    Array.isArray(cases) && cases.length === contract.suites.length,
    'SUCCESS_RECEIPT_REQUIRED',
  );
  for (const suite of contract.suites) {
    const actual = cases.find((entry) => entry.file === suite.file);
    requireThat(
      actual?.passed === suite.count &&
        actual.skipped === 0 &&
        actual.skippedTitles?.length === 0 &&
        Array.isArray(actual.passedTitles) &&
        actual.passedTitles.length === suite.count &&
        [...actual.passedTitles].sort().join('\n') ===
          [...suite.titles].sort().join('\n'),
      'SUCCESS_RECEIPT_REQUIRED',
    );
  }
}

function validateFinalCrunOutcome(outcome, identity) {
  requireThat(
    outcome.completed.length === REQUIRED.final.length &&
      [...outcome.completed.map((entry) => entry.stage)].sort().join('|') ===
        [...REQUIRED.final].sort().join('|'),
    'SUCCESS_RECEIPT_REQUIRED',
  );
  exactKeys(identity.resources.crun, ['image', 'video'], 'CRUN_OWNERSHIP');
  const image = identity.resources.crun.image,
    video = identity.resources.crun.video;
  requireThat(
    image &&
      video &&
      image !== video &&
      image.uuid !== video.uuid &&
      image.manifest !== video.manifest &&
      image.directory !== video.directory,
    'CRUN_OWNERSHIP',
  );
  for (const mediaKind of ['image', 'video']) {
    const resource = identity.resources.crun[mediaKind],
      contract = CRUN_SOURCE_CONTRACT[mediaKind];
    requireThat(
      resource.candidateSHA === identity.candidateSHA &&
        resource.controlSHA === identity.controlSHA &&
        hasFinalCrunTerminationProof(resource, mediaKind) &&
        resource.cleanupResult?.passed === true,
      'CRUN_TERMINATION_PROOF_FAILED',
    );
    const cases = outcome.completed.find(
      (entry) => entry.stage === `crun-${mediaKind}`,
    )?.cases;
    requireThat(
      cases?.length === 1 &&
        cases[0].file === contract.path.slice('apps/server/api/'.length) &&
        cases[0].passed === contract.count &&
        cases[0].skipped === 0 &&
        cases[0].skippedTitles?.length === 0 &&
        Array.isArray(cases[0].passedTitles) &&
        cases[0].passedTitles.length === contract.count &&
        [...cases[0].passedTitles].sort().join('\n') ===
          [...contract.passedTitles].sort().join('\n'),
      'SUCCESS_RECEIPT_REQUIRED',
    );
  }
}
export function validateOutcome(outcome, receipt, identity) {
  requireThat(
    outcome?.version === 1 &&
      ['passed', 'failed'].includes(outcome.status) &&
      outcome.candidateSHA === identity.candidateSHA &&
      outcome.controlSHA === identity.controlSHA &&
      outcome.group === identity.group &&
      Array.isArray(outcome.completed),
    'INVALID_OUTCOME',
  );
  if (outcome.status === 'passed')
    requireThat(
      receipt &&
        JSON.stringify(receipt) === JSON.stringify(outcome) &&
        outcome.cleanup?.passed === true &&
        outcome.failures?.length === 0 &&
        REQUIRED[identity.group].every((stage) =>
          outcome.completed.some((entry) => entry.stage === stage),
        ),
      'SUCCESS_RECEIPT_REQUIRED',
    );
  else requireThat(!receipt, 'FAILED_SUCCESS_RECEIPT');
  if (outcome.status === 'passed' && identity.group === 'final') {
    validateFinalLearningOutcome(outcome, identity);
    validateFinalCrunOutcome(outcome, identity);
  }
  return outcome.status;
}
export async function collectConnectedEvidence(identity) {
  requireThat(identity.group === 'visual-connected', 'GROUP_MISMATCH');
  let bytes = 0;
  let count = 0;
  const visit = async (relative) => {
    const file = path.join(identity.state, relative);
    const metadata = await lstat(file);
    requireThat(
      !metadata.isSymbolicLink() &&
        metadata.uid === process.getuid() &&
        (await realpath(file)) === file,
      'UNSAFE_EVIDENCE_FILE',
    );
    if (metadata.isDirectory()) {
      const handle = await open(
        file,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      try {
        await handle.chmod(0o700);
      } finally {
        await handle.close();
      }
      for (const entry of await readdir(file, { withFileTypes: true }))
        await visit(`${relative}/${entry.name}`);
    } else {
      requireThat(metadata.isFile(), 'UNSAFE_EVIDENCE_FILE');
      const handle = await open(
        file,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      try {
        const current = await handle.stat();
        requireThat(
          current.isFile() && current.uid === process.getuid(),
          'UNSAFE_EVIDENCE_FILE',
        );
        bytes += current.size;
        requireThat(bytes <= RAW_LIMIT, 'RAW_EVIDENCE_TOO_LARGE');
        await handle.chmod(0o600);
      } finally {
        await handle.close();
      }
      if (!identity.evidence.includes(relative))
        identity.evidence.push(relative);
      count++;
    }
  };
  for (const relative of [
    'artifacts',
    'media',
    'renderers',
    'supervisor',
    'runtime-preflight.json',
  ]) {
    const root = `raw/visual/${relative}`;
    try {
      await lstat(path.join(identity.state, root));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    await visit(root);
  }
  return count;
}
export async function collectIsolationEvidence(identity) {
  requireThat(identity.group === 'visual-isolation', 'GROUP_MISMATCH');
  const stateMetadata = await lstat(identity.state);
  requireThat(
    stateMetadata.isDirectory() &&
      !stateMetadata.isSymbolicLink() &&
      stateMetadata.uid === process.getuid() &&
      (await realpath(identity.state)) === identity.state,
    'UNSAFE_EVIDENCE_FILE',
  );
  let collected = 0;
  const visit = async (relative) => {
    const directory = path.join(identity.state, relative);
    const metadata = await lstat(directory);
    requireThat(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        metadata.uid === process.getuid() &&
        (await realpath(directory)) === directory,
      'UNSAFE_EVIDENCE_FILE',
    );
    const handle = await open(
      directory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    try {
      await handle.chmod(0o700);
    } finally {
      await handle.close();
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      requireThat(!entry.isSymbolicLink(), 'UNSAFE_EVIDENCE_FILE');
      if (entry.isDirectory()) await visit(next);
      else {
        requireThat(entry.isFile(), 'UNSAFE_EVIDENCE_FILE');
        const file = await open(
          path.join(identity.state, next),
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
        );
        try {
          const stat = await file.stat();
          requireThat(
            stat.isFile() &&
              stat.uid === process.getuid() &&
              stat.size <= RAW_LIMIT,
            'UNSAFE_EVIDENCE_FILE',
          );
          await file.chmod(0o600);
        } finally {
          await file.close();
        }
        if (!identity.evidence.includes(next)) identity.evidence.push(next);
        collected++;
      }
    }
  };
  try {
    const raw = path.join(identity.state, 'raw');
    const rawMetadata = await lstat(raw);
    requireThat(
      rawMetadata.isDirectory() &&
        !rawMetadata.isSymbolicLink() &&
        (await realpath(raw)) === raw,
      'UNSAFE_EVIDENCE_FILE',
    );
    try {
      await visit('raw/isolation');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  } finally {
    await persistIdentity(identity);
  }
  return collected;
}
const SUMMARY_LINES = 20;
const SUMMARY_LINE_WIDTH = 300;
function clipSummaryLines(text, { tail = false } = {}) {
  const lines = String(text)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escapes and control bytes from CI log text.
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escapes and control bytes from CI log text.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .map((line) => line.trimEnd().slice(0, SUMMARY_LINE_WIDTH));
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines.at(-1) === '') lines.pop();
  return tail ? lines.slice(-SUMMARY_LINES) : lines.slice(0, SUMMARY_LINES);
}
async function readOptionalJson(identity, relative) {
  try {
    return JSON.parse(await safeFile(identity.state, relative));
  } catch {
    return undefined;
  }
}
function firstFailedCase(report) {
  for (const file of report?.testResults ?? []) {
    for (const entry of file.assertionResults ?? [])
      if (entry.status === 'failed')
        return {
          title: entry.fullName ?? entry.title,
          message: (entry.failureMessages ?? []).join('\n'),
        };
    if (file.status === 'failed' && file.message)
      return { title: file.name, message: file.message };
  }
  return undefined;
}
export async function failureSummary(identity, outcome, env = {}) {
  const failures = outcome?.failures ?? [];
  const [first, ...rest] =
    failures.length === 0 && outcome?.cleanup?.passed === false
      ? [{ stage: 'cleanup', code: 'CLEANUP_UNCONFIRMED' }]
      : failures;
  const stage = first?.stage ?? 'unknown';
  const code = first?.code ?? 'UNKNOWN';
  let found;
  let exit;
  let logLines = [];
  try {
    const reports = [
      `raw/${stage}.report.json`,
      ...identity.evidence.filter(
        (relative) =>
          relative.endsWith('.report.json') &&
          relative !== `raw/${stage}.report.json`,
      ),
    ];
    for (const relative of reports) {
      found = firstFailedCase(await readOptionalJson(identity, relative));
      if (found) break;
    }
    const commands = outcome.commands ?? [];
    const index = commands.findLastIndex(
      (command) =>
        command.stage === stage &&
        (command.exitCode !== 0 ||
          command.signal ||
          command.timedOut ||
          command.outputLimit ||
          command.spawnError ||
          command.streamError ||
          command.cleanupError),
    );
    if (index >= 0) {
      const command = commands[index];
      exit =
        command.signal ??
        (command.timedOut ? 'timeout' : (command.exitCode ?? 'unknown'));
      if (!found)
        for (const stream of ['stderr', 'stdout']) {
          try {
            const text = (
              await safeFile(identity.state, `raw/${stage}-${index}.${stream}`)
            ).toString('utf8');
            if (text.trim()) {
              logLines = clipSummaryLines(text, { tail: true });
              break;
            }
          } catch {}
        }
    }
  } catch {}
  const header = [
    `runtime-acceptance failed ${identity.candidateSHA}`,
    `stage=${stage}`,
    `code=${code}`,
    ...(exit === undefined ? [] : [`exit=${exit}`]),
    ...(found?.title ? [`case=${found.title}`] : []),
  ].join(' ');
  const lines = [
    header,
    ...(found ? clipSummaryLines(found.message) : logLines).map(
      (line) => `  ${line}`,
    ),
    ...(rest.length
      ? [
          `  also failed: ${rest
            .slice(0, 5)
            .map((failure) => `${failure.stage}/${failure.code}`)
            .join(', ')}${rest.length > 5 ? ', ...' : ''}`,
        ]
      : []),
  ];
  return `${redactText(lines.join('\n'), env)}\n`;
}
export async function sealState(identity, env, log = () => {}) {
  if (identity.phase === 'prepared') {
    const outcome = {
      version: 1,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      group: identity.group,
      status: 'failed',
      completed: [],
      failures: [{ stage: 'preparation', code: 'PREPARATION_INCOMPLETE' }],
      cleanup: { passed: false, operations: [] },
      commands: [],
      runtime: { node: process.version, platform: process.platform },
    };
    await atomicJson(path.join(identity.state, 'outcome.json'), outcome);
    identity.phase = 'finished';
    await persistIdentity(identity);
  }
  requireThat(['finished', 'sealed'].includes(identity.phase), 'INVALID_PHASE');
  if (identity.phase === 'sealed') {
    const evidence = await safeFile(
      identity.state,
      'public/evidence.json',
      ENVELOPE_LIMIT,
    );
    requireThat(
      sha256(evidence) === identity.evidenceHash,
      'EVIDENCE_HASH_MISMATCH',
    );
    return JSON.parse(
      await safeFile(identity.state, 'public/receipt.json', 65536),
    );
  }
  const outcome = JSON.parse(await safeFile(identity.state, 'outcome.json'));
  let receipt;
  try {
    receipt = JSON.parse(await safeFile(identity.state, 'receipt.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const status = validateOutcome(outcome, receipt, identity);
  if (status === 'failed') log(await failureSummary(identity, outcome, env));
  const files = [];
  let total = 0;
  const allowlist = new Set(identity.evidence);
  if (status === 'passed' && identity.group === 'final') {
    requireThat(
      [
        identity.resources.learning.receiptRelative,
        'raw/learning-runtime-container.json',
        'raw/learning-runtime-blank.json',
        'raw/learning-runtime.report.json',
        'raw/learning-runtime-0.stdout',
        'raw/learning-runtime-0.stderr',
        ...identity.resources.learning.cleanupEvidence,
      ].every((relative) => allowlist.has(relative)),
      'MISSING_LEARNING_EVIDENCE',
    );
    for (const mediaKind of ['image', 'video']) {
      const stage = `crun-${mediaKind}`;
      const index = outcome.commands.findIndex(
        (command) => command.stage === stage,
      );
      requireThat(
        index >= 0 &&
          [
            `raw/${stage}.report.json`,
            `raw/${stage}-manifest.json`,
            `raw/${stage}-${index}.stdout`,
            `raw/${stage}-${index}.stderr`,
          ].every((relative) => allowlist.has(relative)),
        'MISSING_CRUN_EVIDENCE',
      );
    }
  }

  requireThat(
    allowlist.size === identity.evidence.length,
    'DUPLICATE_EVIDENCE',
  );
  for (const relative of allowlist) {
    let bytes;
    try {
      bytes = await safeFile(identity.state, relative);
    } catch (error) {
      if (error.code === 'ENOENT' && status === 'failed') continue;
      throw error;
    }
    total += bytes.length;
    requireThat(total <= RAW_LIMIT, 'RAW_LIMIT');
    files.push({
      path: relative,
      bytes: redactBytes(bytes, env).toString('base64'),
    });
  }
  const serialized = buildEvidence(
    { outcome, ...(receipt ? { receipt } : {}), files },
    identity,
    env,
  );
  await mkdir(path.join(identity.state, 'public'), { mode: 0o700 });
  await privateFile(
    path.join(identity.state, 'public/evidence.json'),
    serialized,
  );
  const publicReceipt = {
    version: 1,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    group: identity.group,
    status,
    passed: outcome.completed
      .flatMap((entry) => entry.cases ?? [])
      .reduce((sum, entry) => sum + entry.passed, 0),
    skipped: outcome.completed
      .flatMap((entry) => entry.cases ?? [])
      .reduce((sum, entry) => sum + entry.skipped, 0),
    groups: outcome.completed.length,
    elapsedMs: outcome.commands.reduce(
      (sum, entry) => sum + entry.elapsedMs,
      0,
    ),
    cleanup: outcome.cleanup.passed,
    evidenceBytes: total,
    evidenceSHA256: sha256(serialized),
  };
  await privateFile(
    path.join(identity.state, 'public/receipt.json'),
    JSON.stringify(publicReceipt),
  );
  identity.phase = 'sealed';
  identity.evidenceHash = publicReceipt.evidenceSHA256;
  await persistIdentity(identity);
  await rm(path.join(identity.state, 'raw'), { recursive: true });
  await rm(path.join(identity.state, 'outcome.json'));
  if (receipt) await rm(path.join(identity.state, 'receipt.json'));
  return publicReceipt;
}
const QUALIFIED_CLI_GROUPS = new Set([
  'dataset-diagnostic',
  'dataset-smoke',
  'dataset-scale',
  'final',
  'agent-production',
  'brand-acceptance',
  'visual-isolation',
  'visual-connected',
]);
function requireQualifiedGroup(group) {
  requireThat(QUALIFIED_CLI_GROUPS.has(group), 'UNQUALIFIED_RUNTIME_GROUP');
}
async function checkQualifiedSealDocuments(identity) {
  for (const relative of [
    'outcome.json',
    'receipt.json',
    'public/receipt.json',
    ...(identity.phase === 'sealed' ? ['public/evidence.json'] : []),
  ]) {
    let bytes;
    try {
      bytes = await safeFile(
        identity.state,
        relative,
        relative.endsWith('evidence.json') ? ENVELOPE_LIMIT : RAW_LIMIT,
      );
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    let document;
    try {
      document = JSON.parse(bytes);
    } catch {
      throw new AcceptanceError('INVALID_QUALIFIED_RECEIPT');
    }
    requireQualifiedGroup(document?.group);
    requireThat(
      document.version === 1 &&
        document.group === identity.group &&
        document.candidateSHA === identity.candidateSHA &&
        document.controlSHA === identity.controlSHA,
      'QUALIFIED_RECEIPT_IDENTITY_MISMATCH',
    );
  }
}
export async function runCli(argv = process.argv.slice(2), env = process.env) {
  try {
    const options = parseArguments(argv);
    if (options.command === 'preflight') requireQualifiedGroup(options.group);
    else if (options.command !== 'seal') requireQualifiedGroup(options.command);
    if (options.command === 'preflight') {
      await createState(options, env);
      if (env.GITHUB_OUTPUT) {
        const handle = await open(env.GITHUB_OUTPUT, 'a');
        try {
          await handle.writeFile('prepared=true\n');
        } finally {
          await handle.close();
        }
      }
      process.stdout.write('runtime-acceptance prepared\n');
      return 0;
    }
    const identity = await loadState(options);
    requireQualifiedGroup(identity.group);
    if (options.command === 'seal') {
      await checkQualifiedSealDocuments(identity);
    }
    if (options.command === 'seal') {
      const receipt = await sealState(identity, env, (text) =>
        process.stdout.write(text),
      );
      process.stdout.write(
        `runtime-acceptance ${receipt.status} ${receipt.candidateSHA} ${receipt.passed}\n`,
      );
      if (receipt.status === 'passed' && env.GITHUB_OUTPUT) {
        const handle = await open(env.GITHUB_OUTPUT, 'a');
        try {
          await handle.writeFile('result=passed\n');
        } finally {
          await handle.close();
        }
      }
      return receipt.status === 'passed' ? 0 : 1;
    }
    requireThat(options.command === identity.group, 'GROUP_MISMATCH');
    const outcome = await execution(identity, env);
    process.stdout.write(
      outcome.status === 'passed'
        ? `runtime-acceptance passed ${identity.candidateSHA}\n`
        : await failureSummary(identity, outcome, env),
    );
    return outcome.status === 'passed' ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `runtime-acceptance ${error instanceof AcceptanceError ? error.code : 'CONTROL_FAILED'}\n`,
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      cancelled = true;
      for (const pid of activeGroups) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
      }
      process.exitCode = 1;
    });
  process.exitCode = await runCli();
}
