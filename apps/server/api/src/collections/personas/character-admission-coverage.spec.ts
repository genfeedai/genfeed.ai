import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CHARACTER_ADMISSION_PATHS } from '@api/collections/personas/utils/character-admission.util';

const SRC_ROOT = join(__dirname, '..', '..');

interface GenerationEntryPoint {
  /** Source file that admits the request's characters. */
  file: string;
  /** Admission path label the file logs refusals under. */
  path: (typeof CHARACTER_ADMISSION_PATHS)[number];
  surface: string;
}

/**
 * Every place a generation request can feed a character into an output. A new
 * path must call the shared character admission and be listed here, or this
 * spec fails.
 */
const ENTRY_POINTS: readonly GenerationEntryPoint[] = [
  {
    file: 'collections/images/services/image-generation.service.ts',
    path: 'image',
    surface:
      'image generation (also reached by Agent, MCP, batch and Storyboard)',
  },
  {
    file: 'collections/images/services/image-generation-admission.service.ts',
    path: 'image-edit',
    surface: 'image edits (also reached by Agent and MCP)',
  },
  {
    file: 'collections/images/services/crun-image-input.service.ts',
    path: 'image',
    surface: 'quoted Crun image generation',
  },
  {
    file: 'collections/videos/services/video-generation-preparation.service.ts',
    path: 'video',
    surface:
      'video generation (also reached by Agent, MCP, batch and Storyboard)',
  },
  {
    file: 'collections/videos/services/crun-video-input.service.ts',
    path: 'video',
    surface: 'quoted Crun video generation',
  },
  {
    file: 'collections/videos/controllers/transformations/extend/videos-extend.controller.ts',
    path: 'video-extend',
    surface: 'video extensions',
  },
  {
    file: 'collections/videos/controllers/batch-interpolation.controller.ts',
    path: 'video-interpolation',
    surface: 'interpolation',
  },
  {
    file: 'collections/videos/controllers/transformations/clip-chain/videos-clip-chain.controller.ts',
    path: 'video-clip-chain',
    surface: 'clip chains',
  },
  {
    file: 'collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller.ts',
    path: 'lip-sync',
    surface: 'lip-sync',
  },
  {
    file: 'collections/videos/services/avatar-video-reference.service.ts',
    path: 'avatar-video',
    surface: 'avatar video (also reached by workflows, batch and Storyboard)',
  },
  {
    file: 'collections/workflows/services/workflow-media-provider-plan.service.ts',
    path: 'workflow',
    surface: 'workflow image and video nodes (also clip-chain segments)',
  },
  {
    file: 'collections/workflows/services/workflow-media-generation-executor-registrar.service.ts',
    path: 'lip-sync',
    surface: 'workflow lip-sync node',
  },
  {
    file: 'collections/content-runs/services/brand-remix-run-planning.service.ts',
    path: 'storyboard',
    surface: 'Storyboard identity and references',
  },
  {
    file: 'collections/content-runs/services/storyboard-source.service.ts',
    path: 'storyboard',
    surface: 'Storyboard plan assets',
  },
  {
    file: 'collections/content-runs/services/storyboard-character-replace.service.ts',
    path: 'storyboard',
    surface: 'Storyboard character replacement',
  },
  {
    file: 'services/agent-orchestrator/tools/agent-media-generation-references.ts',
    path: 'agent-handles',
    surface: 'Agent tool character handles',
  },
];

/**
 * Generation inputs that carry no character on purpose, with the reason.
 * Persona content pipelines act as the character; they do not take one as a
 * reference from a brand that may have lost it.
 */
const EXEMPT_CALLERS: readonly string[] = [
  'services/ai-influencer/ai-influencer.service.ts',
  'services/content-orchestration/content-orchestration.service.ts',
];

/** DTOs whose fields feed assets into a generation, and where they are admitted. */
const DTO_ENTRY_POINTS: Readonly<Record<string, readonly string[]>> = {
  'collections/images/dto/create-image.dto.ts': [
    'collections/images/services/image-generation.service.ts',
  ],
  'collections/images/dto/edit-image.dto.ts': [
    'collections/images/services/image-generation-admission.service.ts',
  ],
  'collections/images/dto/create-crun-image-quote.dto.ts': [
    'collections/images/services/crun-image-input.service.ts',
  ],
  'collections/videos/dto/create-video.dto.ts': [
    'collections/videos/services/video-generation-preparation.service.ts',
  ],
  'collections/videos/dto/create-crun-video-quote.dto.ts': [
    'collections/videos/services/crun-video-input.service.ts',
  ],
  'collections/videos/dto/batch-interpolation.dto.ts': [
    'collections/videos/controllers/batch-interpolation.controller.ts',
  ],
  'collections/videos/dto/video-clip-chain.dto.ts': [
    'collections/videos/controllers/transformations/clip-chain/videos-clip-chain.controller.ts',
  ],
  'collections/videos/dto/create-lip-sync.dto.ts': [
    'collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller.ts',
  ],
  'collections/videos/dto/video-extend.dto.ts': [
    'collections/videos/controllers/transformations/extend/videos-extend.controller.ts',
  ],
  'collections/videos/dto/create-avatar-video.dto.ts': [
    'collections/videos/services/avatar-video-reference.service.ts',
  ],
};

const ADMISSION_CALL = /resolveCharacter(References|Handles|Link)\(/;
const REFERENCE_FIELD =
  /\b(references|videoReferences|endFrame|startImageId|endImageId|characterIngredientIds|characterHandles|photoIngredientId|parent)\??\s*[:!]/;

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    if (name === 'node_modules') {
      return [];
    }
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const read = (file: string) => readFileSync(join(SRC_ROOT, file), 'utf8');

describe('character admission path coverage (#6040)', () => {
  it.each(ENTRY_POINTS)(
    '$surface admits characters through the shared check ($file)',
    ({ file, path }) => {
      const source = read(file);
      expect(source).toMatch(ADMISSION_CALL);
      if (path !== 'agent-handles') {
        expect(source).toContain(`'${path}'`);
      }
    },
  );

  it('only uses declared admission path labels', () => {
    const declared = new Set<string>(CHARACTER_ADMISSION_PATHS);
    for (const entry of ENTRY_POINTS) {
      expect(declared.has(entry.path)).toBe(true);
    }
    const labels = new Set(ENTRY_POINTS.map((entry) => entry.path));
    for (const path of CHARACTER_ADMISSION_PATHS) {
      expect(labels.has(path)).toBe(true);
    }
  });

  it('has no generation code calling the admission outside the registered entry points', () => {
    const registered = new Set([
      ...ENTRY_POINTS.map((entry) => entry.file),
      ...EXEMPT_CALLERS,
      'collections/personas/services/personas.service.ts',
    ]);
    const callers = listFiles(SRC_ROOT)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) => !file.includes(`${join('shared', 'testing')}`))
      .filter((file) => ADMISSION_CALL.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_ROOT, file));
    const unregistered = callers.filter((file) => !registered.has(file));

    expect(
      unregistered,
      `Register ${unregistered.join(', ')} in ENTRY_POINTS so the coverage check sees it.`,
    ).toEqual([]);
  });

  it('maps every generation DTO that accepts media references to an admitting entry point', () => {
    const dtoFiles = ['collections/images/dto', 'collections/videos/dto']
      .flatMap((directory) => listFiles(join(SRC_ROOT, directory)))
      .filter((file) => file.endsWith('.dto.ts'))
      .map((file) => relative(SRC_ROOT, file))
      .filter((file) => REFERENCE_FIELD.test(read(file)));
    const entryFiles = new Set(ENTRY_POINTS.map((entry) => entry.file));

    const unmapped = dtoFiles.filter((file) => !DTO_ENTRY_POINTS[file]);
    expect(
      unmapped,
      `Map ${unmapped.join(', ')} to the file that admits its characters in DTO_ENTRY_POINTS.`,
    ).toEqual([]);
    for (const dto of dtoFiles) {
      for (const handler of DTO_ENTRY_POINTS[dto]) {
        expect(entryFiles.has(handler)).toBe(true);
        expect(read(handler)).toMatch(ADMISSION_CALL);
      }
    }
  });

  it('keeps the persistence of the character link on every admitting generation output', () => {
    for (const file of [
      'collections/images/services/image-generation-persistence.util.ts',
      'collections/videos/services/video-generation-preparation.service.ts',
      'collections/videos/services/avatar-video-generation.service.ts',
      'collections/videos/controllers/batch-interpolation.controller.ts',
      'collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller.ts',
      'collections/workflows/services/workflow-media-provider-plan.service.ts',
    ]) {
      expect(read(file)).toContain('personaId');
    }
  });
});
