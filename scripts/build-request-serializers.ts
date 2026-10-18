import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BuildResult, build, version } from 'esbuild';
import { z } from 'zod';

const packageDirectory = 'packages/serializers';
const artifactName = 'request-runtime.bundle.js';
const compilerBindings = { global: 'globalThis' };
const runtimeExports = [
  'ActivityBulkPatchSerializer',
  'AvatarSerializer',
  'ImageEditSerializer',
  'ImageEditingRequestSerializer',
  'ImageGenerationSerializer',
  'ImageSerializer',
  'IngredientBulkDeleteSerializer',
  'IngredientMergeSerializer',
  'IngredientSerializer',
  'MemberInvitationSerializer',
  'MetadataSerializer',
  'MusicSerializer',
  'NotificationPreferenceSerializer',
  'OrganizationSettingSerializer',
  'SettingSerializer',
  'StripeCheckoutSerializer',
  'TagSerializer',
  'VideoCaptionSerializer',
  'VideoEditSerializer',
  'VideoGenerationSerializer',
  'VideoSerializer',
].sort();
const sourceMapSchema = z.object({
  version: z.literal(3),
  sources: z.array(z.string()),
  sourcesContent: z.array(z.string().nullable()).optional(),
  sourceRoot: z.string().optional(),
  mappings: z.string(),
});

type OriginalSource = {
  path: string;
  contentSha256: string | null;
  evidence:
    | 'source-content-and-disk'
    | 'local-map-content'
    | 'local-map-identity-only';
};
type SourceMapReference = { path: string; sha256: string };
type SourceInput = {
  sha256: string;
  bytesInOutput: number;
  sourceMaps: SourceMapReference[];
  originalSources: OriginalSource[];
};
type BuildOptions = { outputDirectory?: string };

function sha256(source: Uint8Array | string): string {
  return createHash('sha256').update(source).digest('hex');
}

function publicSourcePath(root: string, source: string): string {
  const relative = path.relative(root, source).split(path.sep).join('/');
  if (!relative.startsWith('../')) return relative;
  const dependency = source.lastIndexOf('/node_modules/');
  if (dependency !== -1) return source.slice(dependency + 1);
  throw new Error('Request runtime source escaped the local workspace');
}

function confinedPath(parent: string, source: string): boolean {
  const relative = path.relative(parent, source);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function installedPackageRoot(source: string): string | null {
  const marker = `${path.sep}node_modules${path.sep}`;
  const index = source.lastIndexOf(marker);
  if (index === -1) return null;
  const segments = source.slice(index + marker.length).split(path.sep);
  const count = segments[0]?.startsWith('@') ? 2 : 1;
  return (
    source.slice(0, index + marker.length) +
    segments.slice(0, count).join(path.sep)
  );
}

function localMapPath(
  parent: string,
  reference: string,
  packageRoot: string,
): string {
  if (!reference || /^[\\/]|[:?#\\]/.test(reference))
    throw new Error('Invalid local source-map reference');
  const candidate = path.resolve(parent, reference);
  if (!confinedPath(packageRoot, candidate))
    throw new Error('Local source-map path escapes the installed package');
  let ancestor = candidate;
  let depth = 0;
  while (!existsSync(ancestor)) {
    if (++depth > 32) throw new Error('Local source-map path depth exceeded');
    ancestor = path.dirname(ancestor);
  }
  if (!confinedPath(realpathSync(packageRoot), realpathSync(ancestor)))
    throw new Error('Local source-map path escapes the installed package');
  return candidate;
}

export function validateRequestRuntimeBuild(root: string, result: BuildResult) {
  if (result.errors.length) throw new Error('Request runtime build failed');
  const files = result.outputFiles ?? [];
  const javaScript = files.filter((file) => file.path.endsWith('.js'));
  if (javaScript.length !== 1 || files.length !== 2)
    throw new Error(
      'Expected one JavaScript artifact and its linked source map',
    );
  const output = javaScript[0];
  const mapFile = files.find((file) => file.path === `${output.path}.map`);
  if (!mapFile) throw new Error('Missing request runtime source map');
  const metadata = result.metafile;
  const entry = Object.entries(metadata?.outputs ?? {}).find(
    ([filename]) => path.resolve(root, filename) === output.path,
  )?.[1];
  if (
    !entry ||
    entry.imports.length ||
    !entry.entryPoint ||
    path.resolve(root, entry.entryPoint) !==
      path.join(root, packageDirectory, 'src/request-runtime.ts')
  )
    throw new Error(
      'Request runtime must be closed ESM with no external imports',
    );
  if (
    JSON.stringify([...entry.exports].sort()) !== JSON.stringify(runtimeExports)
  )
    throw new Error(
      'Request runtime must contain exactly the 21 canonical exports',
    );
  const parsed = sourceMapSchema.safeParse(
    JSON.parse(Buffer.from(mapFile.contents).toString('utf8')),
  );
  if (!parsed.success) throw new Error('Missing original source-map content');
  const map = parsed.data;
  if (
    !map.sourcesContent ||
    map.sources.length !== map.sourcesContent.length ||
    !map.mappings
  )
    throw new Error('Missing original source-map content');
  const originalSources = new Map<string, string | null>();
  for (const [index, source] of map.sources.entries()) {
    const absolute = path.resolve(
      path.dirname(mapFile.path),
      map.sourceRoot ?? '',
      source,
    );
    const content = map.sourcesContent[index];
    if (
      originalSources.has(absolute) &&
      originalSources.get(absolute) !== content
    )
      throw new Error('Conflicting original source-map content');
    originalSources.set(absolute, content);
  }
  const inputs: Record<string, SourceInput> = {};
  let readBytes = 0;
  const readCache = new Map<string, string>();
  const sourceMapPaths = new Set<string>();
  function readBounded(filename: string): string {
    const cached = readCache.get(filename);
    if (cached !== undefined) return cached;
    const size = statSync(filename).size;
    readBytes += size;
    if (readBytes > 16 * 1024 * 1024)
      throw new Error('Source-map read budget exceeded');
    const text = readFileSync(filename, 'utf8');
    readCache.set(filename, text);
    return text;
  }
  for (const [source, contribution] of Object.entries(entry.inputs)) {
    if (!contribution.bytesInOutput) continue;
    const absolute = path.resolve(root, source);
    const name = publicSourcePath(root, absolute);
    const actual = readBounded(absolute);
    const sourceMaps = new Map<string, SourceMapReference>();
    const leaves = new Map<string, OriginalSource>();
    const packageRoot = installedPackageRoot(absolute);
    function resolveOriginals(
      filename: string,
      content: string | null,
      depth: number,
      visited: Set<string>,
    ): void {
      if (visited.has(filename)) throw new Error('Source-map cycle detected');
      const nextVisited = new Set(visited).add(filename);
      const urls =
        content === null
          ? []
          : [
              ...content.matchAll(
                /(?:\/\/[#@]\s*sourceMappingURL=([^\r\n]+)|\/\*[#@]\s*sourceMappingURL=([^*]+)\*\/)/g,
              ),
            ].map((match) => (match[1] ?? match[2]).trim());
      if (urls.length > 1)
        throw new Error('Conflicting local source-map references');
      if (urls.length) {
        if (!packageRoot)
          throw new Error('Unproven original source-map content');
        if (depth >= 4) throw new Error('Source-map depth limit exceeded');
        const file = localMapPath(path.dirname(filename), urls[0], packageRoot);
        sourceMapPaths.add(file);
        if (sourceMapPaths.size > 128)
          throw new Error('Source-map count limit exceeded');
        const raw = readBounded(file);
        const upstream = sourceMapSchema.parse(JSON.parse(raw));
        if (
          !upstream.mappings ||
          !upstream.sources.length ||
          (upstream.sourcesContent &&
            upstream.sourcesContent.length !== upstream.sources.length)
        )
          throw new Error('Missing original source-map content');
        const mapName = publicSourcePath(root, file);
        sourceMaps.set(file, { path: mapName, sha256: sha256(raw) });
        for (const [index, original] of upstream.sources.entries()) {
          const reference = upstream.sourceRoot
            ? `${upstream.sourceRoot}/${original}`
            : original;
          const target = localMapPath(
            path.dirname(file),
            reference,
            packageRoot,
          );
          const embedded = upstream.sourcesContent?.[index] ?? null;
          const disk = existsSync(target) ? readBounded(target) : null;
          if (embedded !== null && disk !== null && embedded !== disk)
            throw new Error('Conflicting original source-map content');
          resolveOriginals(target, embedded ?? disk, depth + 1, nextVisited);
        }
        return;
      }
      const original = publicSourcePath(root, filename);
      const onDisk = existsSync(filename) ? readBounded(filename) : null;
      if (content !== null && onDisk !== null && content !== onDisk)
        throw new Error('Conflicting original source-map content');
      const effective = content ?? onDisk;
      if (
        !originalSources.has(filename) ||
        originalSources.get(filename) !== effective
      )
        throw new Error(
          `Missing or altered original source-map content: ${original}`,
        );
      if (effective === null && (!packageRoot || !sourceMaps.size))
        throw new Error(`Unproven original source identity: ${original}`);
      const proof: OriginalSource = {
        path: original,
        contentSha256: effective === null ? null : sha256(effective),
        evidence:
          effective === null
            ? 'local-map-identity-only'
            : onDisk !== null
              ? 'source-content-and-disk'
              : 'local-map-content',
      };
      const previous = leaves.get(filename);
      if (previous && previous.contentSha256 !== proof.contentSha256)
        throw new Error('Conflicting original source-map content');
      leaves.set(filename, proof);
    }
    if (!packageRoot && originalSources.get(absolute) !== actual)
      throw new Error(
        `Missing or altered original source-map content: ${name}`,
      );
    resolveOriginals(absolute, actual, 0, new Set());
    inputs[name] = {
      sha256: sha256(actual),
      bytesInOutput: contribution.bytesInOutput,
      sourceMaps: [...sourceMaps.values()],
      originalSources: [...leaves.values()],
    };
  }
  for (const required of [
    'packages/serializers/src/',
    'node_modules/ts-jsonapi/',
    'node_modules/lodash/',
  ]) {
    if (!Object.keys(inputs).some((source) => source.includes(required)))
      throw new Error(`Missing original source provenance: ${required}`);
  }
  const publicOutput = (filename: string) => {
    const relative = path.relative(root, filename).split(path.sep).join('/');
    return relative.startsWith('../') ? path.basename(filename) : relative;
  };
  return {
    schemaVersion: 1,
    bundler: { name: 'esbuild', version },
    compilerBindings: { ...compilerBindings },
    output: publicOutput(output.path),
    sha256: sha256(output.contents),
    sourceMap: publicOutput(mapFile.path),
    sourceMapSha256: sha256(mapFile.contents),
    exports: [...entry.exports].sort(),
    inputs,
  };
}

export async function buildRequestSerializers(
  root: string,
  options: BuildOptions = {},
) {
  const outputDirectory =
    options.outputDirectory ?? path.join(root, packageDirectory, 'dist');
  const result = await build({
    absWorkingDir: root,
    entryPoints: [path.join(packageDirectory, 'src/request-runtime.ts')],
    outfile: path.join(outputDirectory, artifactName),
    tsconfig: path.join(root, packageDirectory, 'tsconfig.json'),
    platform: 'browser',
    define: compilerBindings,
    format: 'esm',
    target: 'es2022',
    bundle: true,
    splitting: false,
    minify: false,
    keepNames: true,
    metafile: true,
    sourcemap: 'linked',
    sourcesContent: true,
    write: false,
    logLevel: 'silent',
  });
  const proof = validateRequestRuntimeBuild(root, result);
  mkdirSync(outputDirectory, { recursive: true });
  for (const file of result.outputFiles ?? [])
    writeFileSync(file.path, file.contents);
  writeFileSync(
    path.join(outputDirectory, 'request-runtime.provenance.json'),
    `${JSON.stringify(proof, null, 2)}\n`,
  );
  return proof;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  await buildRequestSerializers(root);
}
