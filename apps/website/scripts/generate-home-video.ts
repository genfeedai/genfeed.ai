/**
 * Homepage video pipeline — generate, stitch, encode, poster, publish.
 *
 * The homepage plays generated footage in two places: a montage behind the hero
 * headline, and one looping clip per card in the output carousel. All of it is
 * *itself* Genfeed output, produced through the same Replicate provider the
 * product uses, so the marketing surface is not making a claim the product
 * cannot back.
 *
 * Nothing here runs at request time or at build time. This is an operator
 * script, run by hand, whose only artefacts are the files it uploads to the CDN.
 *
 * The pipeline, in order:
 *
 *   1. generate  — Replicate text-to-video → one raw MP4 per scene
 *   2. stitch    — hero only: crossfade the scenes into one continuous montage
 *   3. close     — crossfade the tail over the head so playback has no seam
 *   4. encode    — H.264 MP4 (Safari/iOS, `+faststart`) and VP9 WebM (Chrome/FF)
 *   5. poster    — frame 0 of the *encoded MP4*, as WebP + JPEG
 *   6. upload    — s3://cdn.genfeed.ai/assets/branding/website/home/**
 *
 * Step 5 is why the poster comes from the encoded output rather than the raw
 * download: the browser paints `poster` until the first decoded frame is ready,
 * so the poster has to be the byte-identical first frame of the file the browser
 * actually plays. A poster taken from a different encode leaves a visible flash
 * on the handoff — the exact seam this script exists to remove.
 *
 * Raw downloads are cached under `.home-video/raw/` and reused. Generation is
 * the only step that costs money, so it never repeats unless asked: re-running
 * after a failed encode re-encodes, it does not re-generate.
 *
 * Usage:
 *     bun run scripts/generate-home-video.ts --dry-run      # print the plan, spend nothing
 *     bun run scripts/generate-home-video.ts                # generate what is missing, encode all
 *     bun run scripts/generate-home-video.ts --only hero    # hero montage only
 *     bun run scripts/generate-home-video.ts --only formats # carousel clips only
 *     bun run scripts/generate-home-video.ts --regenerate   # ignore the raw cache (spends)
 *     bun run scripts/generate-home-video.ts --upload       # publish to the CDN
 *
 * Credentials come from the repo `.env.local` (REPLICATE_KEY, AWS_*); this
 * script never prints them. Requires `ffmpeg`, `ffprobe`, and `cwebp` on PATH.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const logger = {
  error: (message: string) => console.error(`[home-video] ${message}`),
  log: (message: string) => console.log(`[home-video] ${message}`),
};

// ─── Model ──────────────────────────────────────────────────────────────────

/**
 * Seedance 2.5 tops out at 720p, which is the right ceiling here: every clip
 * either sits behind two overlays and a 5.5rem headline, or plays inside a card
 * a few hundred pixels wide. Resolution buys nothing a visitor can see while
 * costing every visitor the bytes. It renders coherent human motion without the
 * plastic "AI b-roll" look and returns a plain MP4.
 *
 * Pinned by name, not by version hash: Replicate resolves the owner/name form to
 * the current version, and these clips are regenerated deliberately, never on a
 * schedule that a stale pin would silently break.
 */
const MODEL = 'bytedance/seedance-2.5';

/**
 * Shared tail of every prompt. The overlay and the card chrome do the talking,
 * so the footage only has to be dark, continuous, and unbranded.
 *
 * The unbranded clause is not decoration. ByteDance runs a filter over its own
 * *output* and refuses anything that reads as a recognisable product or mark —
 * "the output video may be related to copyright restrictions" — which is a hard
 * failure, not a warning. Naming plain unlabelled packaging up front is what
 * keeps a scene from being refused after it has already been paid for.
 */
const SHARED_STYLE = [
  'Generic unbranded props with plain unlabelled packaging: no brand marks, no',
  'logos, no product names, no recognisable trademarks, no on-screen text, no',
  'captions, no watermark. One continuous shot, no cuts. Cinematic 35mm look,',
  'shallow depth of field, subtle film grain, dark background with warm',
  'practical lighting, slow deliberate camera motion.',
].join(' ');

// ─── Scenes ─────────────────────────────────────────────────────────────────

type Scene = {
  aspectRatio: '16:9' | '9:16';
  durationSeconds: number;
  key: string;
  prompt: string;
};

/**
 * The hero montage. Three creators, three rooms, one register — the point is
 * that Genfeed makes *many* pieces in one voice, so the scenes have to feel cut
 * from the same footage rather than sampled from three different stock libraries.
 */
const HERO_SCENES: Scene[] = [
  {
    aspectRatio: '16:9',
    durationSeconds: 10,
    key: 'hero-01-skincare',
    prompt: `Handheld UGC footage: a young woman in a dim modern apartment films herself on a phone ring light, smiling and talking to camera about a small glass serum bottle she is holding. Warm practical lighting against a near-black bedroom, slow natural handheld drift. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '16:9',
    durationSeconds: 10,
    key: 'hero-02-kitchen',
    prompt: `Handheld UGC footage: a man in his late twenties in a dark kitchen at night, lit by one warm lamp, talking to camera and gesturing with a plain white ceramic mug. Steam catches the light against a black background, slow natural handheld drift. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '16:9',
    durationSeconds: 10,
    key: 'hero-03-desk',
    prompt: `Handheld UGC footage: a woman at a dark desk at night, face lit by a monitor and one warm lamp, turning to camera mid-sentence and holding up a pair of plain matte black over-ear headphones. Deep black room behind her, slow natural handheld drift. ${SHARED_STYLE}`,
  },
];

/**
 * One clip per carousel card, keyed to the format the card names. Portrait,
 * because every card in the rail is portrait and `object-cover` on a landscape
 * source would crop a 16:9 frame down to a band.
 */
const FORMAT_SCENES: Scene[] = [
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'images',
    prompt: `Slow orbit around a matte cosmetic jar and a glass dropper bottle on a dark stone surface, moody rim light, drifting haze, product photography set. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'reels',
    prompt: `Vertical UGC footage: a young woman walking through a dark city street at night lit by shop signs, turning to camera and laughing mid-stride, phone-held framing. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'ads',
    prompt: `A pair of plain unbranded knit running shoes rotating slowly on a dark reflective platform, hard rim light raking across the material, fine dust drifting through the beam, commercial product set. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'articles',
    prompt: `Overhead shot of hands turning the pages of an open blank magazine on a dark wooden desk beside a plain coffee cup, one warm lamp raking across the empty paper, slow push in. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'avatars',
    prompt: `Vertical portrait of a woman speaking directly to camera in a dark studio, soft key light on one side of her face, plain black background, presenter framing, slow push in. ${SHARED_STYLE}`,
  },
  {
    aspectRatio: '9:16',
    durationSeconds: 5,
    key: 'voice',
    prompt: `A studio condenser microphone on a boom arm in a dark room, one warm light glancing off the grille, a blurred figure leaning toward it in the background, slow drift around the mic. ${SHARED_STYLE}`,
  },
];

// ─── Encoding ───────────────────────────────────────────────────────────────

/**
 * Length of the crossfade that closes a loop, and the one that joins two hero
 * scenes. Long enough to hide a change of framing or subject, short enough that
 * the blended second does not read as a dissolve.
 */
const BLEND_SECONDS = 1;

/**
 * Native output widths. The encode never upscales past them — a 720p source
 * stretched to 1080 is the same picture in more bytes.
 */
const OUTPUT_WIDTH = {
  '9:16': 720,
  '16:9': 1280,
} as const;

const CDN_BUCKET = 'cdn.genfeed.ai';
const CDN_PREFIX = 'assets/branding/website/home';
const OUTPUT_DIR = path.resolve(import.meta.dirname, '../.home-video');
const RAW_DIR = path.join(OUTPUT_DIR, 'raw');
const BUILD_DIR = path.join(OUTPUT_DIR, 'build');

// ─── Shell ──────────────────────────────────────────────────────────────────

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr?.slice(-2000) ?? ''}`,
    );
  }

  return result.stdout ?? '';
}

function requireBinary(name: string): void {
  if (spawnSync('which', [name]).status !== 0) {
    throw new Error(`${name} is not on PATH — install it before running this.`);
  }
}

function probeDuration(file: string): number {
  const duration = Number.parseFloat(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ]).trim(),
  );

  if (!Number.isFinite(duration)) {
    throw new Error(`could not read a duration from ${file}`);
  }

  return duration;
}

// ─── Credentials ────────────────────────────────────────────────────────────

/**
 * Read one key out of the repo-root `.env.local` without pulling a dotenv
 * dependency into the website. Values are returned to the caller and never
 * logged; the caller only ever reports presence.
 */
function readEnvLocal(key: string): string | undefined {
  const envPath = path.resolve(import.meta.dirname, '../../../.env.local');

  if (process.env[key]) return process.env[key];
  if (!existsSync(envPath)) return undefined;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match?.[1] === key) {
      return match[2]?.trim().replace(/^["']|["']$/g, '');
    }
  }

  return undefined;
}

// ─── 1. Generate ────────────────────────────────────────────────────────────

/**
 * One scene → one raw MP4, cached on disk. Generation is the only step that
 * costs money, so a cached raw is reused unless the caller explicitly asks for
 * a fresh one.
 */
async function generateScene(
  scene: Scene,
  token: string,
  shouldRegenerate: boolean,
): Promise<string> {
  const destination = path.join(RAW_DIR, `${scene.key}.mp4`);

  if (existsSync(destination) && !shouldRegenerate) {
    logger.log(`${scene.key}: reusing cached raw`);
    return destination;
  }

  const { default: Replicate } = await import('replicate');
  const replicate = new Replicate({ auth: token });

  logger.log(`${scene.key}: generating — this takes a few minutes`);

  const output = await replicate.run(MODEL, {
    input: {
      aspect_ratio: scene.aspectRatio,
      duration: scene.durationSeconds,
      // Every clip plays muted by policy, so a generated soundtrack would be
      // bytes nobody hears — and `-an` strips it in the encode regardless.
      generate_audio: false,
      prompt: scene.prompt,
      resolution: '720p',
      watermark: false,
    },
  });

  const url =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? String(output[0])
        : String((output as { url?: () => URL }).url?.() ?? output);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${scene.key}: download failed (${response.status})`);
  }

  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  logger.log(`${scene.key}: downloaded`);

  return destination;
}

// ─── 2. Stitch ──────────────────────────────────────────────────────────────

/**
 * Chain several scenes into one montage, each crossfading into the next.
 *
 * `xfade` overlaps its inputs, so every join costs one scene-second: three ten
 * second scenes make a twenty-eight second montage, not thirty. Offsets are
 * accumulated against the running output length rather than the input lengths,
 * which is the difference between a montage that stays in sync and one that
 * drifts a second further out at every join.
 */
function stitch(sources: readonly string[], destination: string): string {
  if (sources.length === 1) return sources[0] as string;

  logger.log(`stitching ${sources.length} scenes with crossfades`);

  const filters: string[] = [];
  let label = '[0:v]';
  let runningLength = probeDuration(sources[0] as string);

  for (let index = 1; index < sources.length; index += 1) {
    const next = `[${index}:v]`;
    const output = index === sources.length - 1 ? '[out]' : `[x${index}]`;
    const offset = runningLength - BLEND_SECONDS;

    filters.push(
      `${label}${next}xfade=transition=fade:duration=${BLEND_SECONDS}:offset=${offset.toFixed(3)}${output}`,
    );

    runningLength += probeDuration(sources[index] as string) - BLEND_SECONDS;
    label = output;
  }

  run('ffmpeg', [
    '-y',
    ...sources.flatMap((source) => ['-i', source]),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '16',
    destination,
  ]);

  return destination;
}

// ─── 3. Close the loop ──────────────────────────────────────────────────────

/**
 * Make a clip loop without a cut.
 *
 * A generated shot does not end where it started, so `<video loop>` snaps back
 * to the opening frame once per pass and reads as a jump cut. Rather than pay
 * for a ping-pong — twice the bytes for the same footage — the tail is
 * crossfaded over the head and the head is then dropped: the output's last
 * frame *is* its first frame, so the loop point has nothing to see.
 *
 * Costs one second of runtime, nothing in file size.
 */
function closeLoop(source: string, destination: string): string {
  const total = probeDuration(source);
  const tailStart = total - BLEND_SECONDS;

  logger.log(`closing the loop with a ${BLEND_SECONDS}s crossfade`);

  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-filter_complex',
    [
      `[0:v]trim=0:${BLEND_SECONDS},setpts=PTS-STARTPTS[head]`,
      `[0:v]trim=${BLEND_SECONDS}:${tailStart},setpts=PTS-STARTPTS[body]`,
      `[0:v]trim=${tailStart}:${total},setpts=PTS-STARTPTS[tail]`,
      `[tail][head]xfade=transition=fade:duration=${BLEND_SECONDS}:offset=0[blend]`,
      '[body][blend]concat=n=2:v=1:a=0[out]',
    ].join(';'),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '16',
    destination,
  ]);

  return destination;
}

// ─── 4 & 5. Encode and poster ───────────────────────────────────────────────

type Artefacts = {
  mp4: string;
  posterJpg: string;
  posterWebp: string;
  webm: string;
};

/**
 * Two encodes of the same source plus the poster. WebM/VP9 is roughly a third
 * smaller at the same perceived quality but is not decodable on older Safari, so
 * the MP4 is the guaranteed fallback and is listed second in the `<source>` order.
 *
 * `-an` strips audio outright: every clip is muted by policy, and shipping a
 * silent audio track only costs bytes. `+faststart` moves the MP4 moov atom to
 * the front so the first frame decodes before the whole file has arrived.
 *
 * The WebP poster goes through `cwebp` rather than ffmpeg because Homebrew's
 * ffmpeg is built without libwebp; a lossless PNG is the intermediate so the
 * encode is the only lossy step.
 */
function encode(source: string, name: string, width: number): Artefacts {
  const artefacts: Artefacts = {
    mp4: path.join(BUILD_DIR, `${name}.mp4`),
    posterJpg: path.join(BUILD_DIR, `${name}-poster.jpg`),
    posterWebp: path.join(BUILD_DIR, `${name}-poster.webp`),
    webm: path.join(BUILD_DIR, `${name}.webm`),
  };
  const scale = `scale=${width}:-2:flags=lanczos`;

  logger.log(`${name}: encoding H.264 MP4`);
  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-an',
    '-vf',
    scale,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    artefacts.mp4,
  ]);

  logger.log(`${name}: encoding VP9 WebM`);
  run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-an',
    '-vf',
    scale,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '34',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    artefacts.webm,
  ]);

  // `-frames:v 1` on an unseeked input is deliberate: seeking would land on the
  // nearest keyframe, which is frame 0 here but would silently drift the day the
  // encode settings change — and a poster that is not frame 0 reintroduces
  // exactly the flash this pipeline exists to remove.
  logger.log(`${name}: extracting frame 0 as the poster`);
  const frame = path.join(BUILD_DIR, `${name}-frame-0.png`);
  run('ffmpeg', ['-y', '-i', artefacts.mp4, '-frames:v', '1', frame]);
  run('cwebp', ['-quiet', '-q', '82', frame, '-o', artefacts.posterWebp]);
  run('ffmpeg', ['-y', '-i', frame, '-q:v', '4', artefacts.posterJpg]);

  return artefacts;
}

// ─── 6. Upload ──────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function upload(artefacts: Artefacts, prefix: string): void {
  for (const file of Object.values(artefacts)) {
    const key = `${CDN_PREFIX}/${prefix}/${path.basename(file)}`;
    logger.log(`uploading ${key}`);

    run('aws', [
      's3',
      'cp',
      file,
      `s3://${CDN_BUCKET}/${key}`,
      '--content-type',
      CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      '--cache-control',
      'public, max-age=31536000, immutable',
    ]);
  }
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

/**
 * Every scene at once, and one refusal does not take the batch down with it.
 *
 * Replicate runs predictions concurrently and a 720p clip takes the better part
 * of twenty minutes, so generating nine in sequence costs an afternoon for no
 * reason. But `Promise.all` rejects on the first failure, and ByteDance's output
 * filter refuses a scene often enough that losing eight good clips to one
 * refusal is a real outcome — so failures are collected and reported, and the
 * scenes that succeeded still get built.
 *
 * Cached scenes resolve immediately and cost nothing, so this is safe to re-run:
 * a second pass regenerates only what is still missing.
 */
async function generateAll(
  scenes: readonly Scene[],
  token: string,
  shouldRegenerate: boolean,
): Promise<{ key: string; source: string }[]> {
  const settled = await Promise.allSettled(
    scenes.map((scene) => generateScene(scene, token, shouldRegenerate)),
  );

  return settled.flatMap((result, index) => {
    const scene = scenes[index] as Scene;

    if (result.status === 'rejected') {
      logger.error(`${scene.key}: SKIPPED — ${String(result.reason)}`);
      return [];
    }

    return [{ key: scene.key, source: result.value }];
  });
}

async function buildHero(
  token: string,
  shouldRegenerate: boolean,
  shouldUpload: boolean,
): Promise<void> {
  const generated = await generateAll(HERO_SCENES, token, shouldRegenerate);

  if (generated.length === 0) {
    throw new Error('every hero scene failed — nothing to stitch');
  }

  const sources = generated.map(({ source }) => source);
  const montage = stitch(sources, path.join(BUILD_DIR, 'hero-montage.mp4'));
  const looped = closeLoop(montage, path.join(BUILD_DIR, 'hero-looped.mp4'));
  const artefacts = encode(looped, 'hero-loop', OUTPUT_WIDTH['16:9']);

  if (shouldUpload) upload(artefacts, 'hero');
}

async function buildFormats(
  token: string,
  shouldRegenerate: boolean,
  shouldUpload: boolean,
): Promise<void> {
  const generated = await generateAll(FORMAT_SCENES, token, shouldRegenerate);

  // Encoding stays sequential on purpose: ffmpeg already saturates the cores,
  // so running six of them at once makes each one slower without finishing the
  // set any sooner.
  for (const { key, source } of generated) {
    const looped = closeLoop(source, path.join(BUILD_DIR, `${key}-looped.mp4`));
    const artefacts = encode(looped, key, OUTPUT_WIDTH['9:16']);

    if (shouldUpload) upload(artefacts, 'formats');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const shouldRegenerate = args.includes('--regenerate');
  const shouldUpload = args.includes('--upload');
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex === -1 ? undefined : args[onlyIndex + 1];

  if (only && only !== 'hero' && only !== 'formats') {
    throw new Error(`--only takes "hero" or "formats", not "${only}"`);
  }

  const token =
    readEnvLocal('REPLICATE_KEY') ?? readEnvLocal('REPLICATE_API_TOKEN');

  if (isDryRun) {
    const scenes = [
      ...(only === 'formats' ? [] : HERO_SCENES),
      ...(only === 'hero' ? [] : FORMAT_SCENES),
    ];

    logger.log(`model:         ${MODEL}`);
    logger.log(`replicate key: ${token ? 'found' : 'MISSING'}`);
    logger.log(`cdn target:    s3://${CDN_BUCKET}/${CDN_PREFIX}/`);
    logger.log(`scenes:        ${scenes.length}`);

    for (const scene of scenes) {
      const cached = existsSync(path.join(RAW_DIR, `${scene.key}.mp4`));
      logger.log(
        `  ${scene.key.padEnd(18)} ${scene.aspectRatio} ${scene.durationSeconds}s  ${
          cached && !shouldRegenerate ? 'cached' : 'WILL GENERATE'
        }`,
      );
    }

    return;
  }

  for (const binary of ['ffmpeg', 'ffprobe', 'cwebp']) requireBinary(binary);
  if (shouldUpload) requireBinary('aws');

  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(BUILD_DIR, { recursive: true });

  if (!token) {
    throw new Error('REPLICATE_KEY is not set — cannot generate.');
  }

  if (only !== 'formats')
    await buildHero(token, shouldRegenerate, shouldUpload);
  if (only !== 'hero')
    await buildFormats(token, shouldRegenerate, shouldUpload);

  logger.log(
    shouldUpload
      ? `published to https://${CDN_BUCKET}/${CDN_PREFIX}/`
      : `wrote artefacts to ${BUILD_DIR} (pass --upload to publish)`,
  );
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
