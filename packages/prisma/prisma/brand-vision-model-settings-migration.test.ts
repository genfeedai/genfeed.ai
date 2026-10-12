import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261012120000_brand_vision_model_settings/migration.sql',
  ),
  'utf8',
);

const platformSettingModel = schemaSource.slice(
  schemaSource.indexOf('model PlatformSetting {'),
  schemaSource.indexOf('\n}', schemaSource.indexOf('model PlatformSetting {')),
);

// The keys the model catalog seed registers (BRAND_VISION_*_MODEL_KEY in
// @genfeedai/contracts); the contracts defaults test pins the same values.
const OCR_KEY = 'lucataco/florence-2-large';
const DETECT_KEY = 'adirik/owlvit-base-patch32';

describe('Brand vision model settings (#6727)', () => {
  it('stores the selected catalog model keys as nullable text defaulting to the registered rows', () => {
    expect(platformSettingModel).toMatch(
      new RegExp(
        `brandVisionOcrModelKey\\s+String\\?\\s+@default\\("${OCR_KEY}"\\)`,
      ),
    );
    expect(platformSettingModel).toMatch(
      new RegExp(
        `brandVisionDetectModelKey\\s+String\\?\\s+@default\\("${DETECT_KEY}"\\)`,
      ),
    );
  });

  it('adds both columns in one statement without touching the analysis switch', () => {
    expect(migrationSource).toContain(
      `ADD COLUMN "brandVisionOcrModelKey" TEXT DEFAULT '${OCR_KEY}'`,
    );
    expect(migrationSource).toContain(
      `ADD COLUMN "brandVisionDetectModelKey" TEXT DEFAULT '${DETECT_KEY}'`,
    );
    expect(migrationSource).not.toContain('isBrandVisualAnalysisEnabled');
    expect(migrationSource).not.toMatch(/UPDATE\s+"platform_settings"/);
  });

  it('leaves the switch off by default', () => {
    expect(platformSettingModel).toMatch(
      /isBrandVisualAnalysisEnabled\s+Boolean\s+@default\(false\)/,
    );
  });
});
