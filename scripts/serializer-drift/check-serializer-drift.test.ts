import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseCliFiles,
  runCheckSerializerDrift,
} from '../check-serializer-drift';

describe('check-serializer-drift', () => {
  let fixtureRoot = '';

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'serializer-drift-'));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it('collects files from repeated CLI selection groups', () => {
    expect(
      parseCliFiles([
        '--files',
        'first.schema.ts',
        '--other',
        '--files',
        'second.attributes.ts',
      ]),
    ).toEqual(['first.schema.ts', 'second.attributes.ts']);
  });

  it('discovers a direct Prisma document re-export through serializer barrels', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'], useBarrels: true });

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result).toMatchObject({
      discoveredSchemaCount: 1,
      drifts: [],
      errors: [],
      matchedCount: 1,
      scannedCount: 1,
      serializerCount: 1,
    });
  });

  it('accepts fields declared by an aliased Prisma document projection', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      [
        "import type { Widget as PrismaWidget } from '@genfeedai/prisma';",
        '',
        'export interface WidgetDocument',
        "  extends Omit<PrismaWidget, 'payload'> {",
        '  displayValue: string;',
        '}',
      ].join('\n'),
    );
    writeSerializerTriplet({ fields: ['displayValue'] });

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.matchedCount).toBe(1);
  });

  it('resolves filtered createEntityAttributes calls with nested callbacks', () => {
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      'model ApiKey {\n  id String @id\n  key String\n  label String\n}',
    );
    writeFixture(
      'apps/server/api/src/collections/api-keys/schemas/api-key.schema.ts',
      "export type { ApiKey as ApiKeyDocument } from '@genfeedai/prisma';",
    );
    writeFixture(
      'packages/serializers/src/attributes/common/api-key.attributes.ts',
      [
        "import { createEntityAttributes } from '@genfeedai/helpers';",
        "export const apiKeyFullAttributes = createEntityAttributes(['key', 'label']);",
        'export const apiKeyAttributes = createEntityAttributes(',
        "  apiKeyFullAttributes.filter((attr: string) => attr !== 'key'),",
        ');',
      ].join('\n'),
    );
    writeFixture(
      'packages/serializers/src/configs/common/api-key.config.ts',
      [
        "import { apiKeyAttributes } from '@serializers/attributes/common/api-key.attributes';",
        "export const apiKeySerializerConfig = { attributes: apiKeyAttributes, type: 'api-key' };",
      ].join('\n'),
    );
    writeFixture(
      'packages/serializers/src/server/common/api-key.serializer.ts',
      [
        "import { buildSerializer } from '@serializers/builders';",
        "import { apiKeySerializerConfig } from '@serializers/configs/common/api-key.config';",
        "export const { ApiKeySerializer } = buildSerializer('server', apiKeySerializerConfig);",
      ].join('\n'),
    );

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.matchedCount).toBe(1);
  });

  it('includes server-only attributes appended by a local serializer config', () => {
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      'model Video {\n  id String @id\n  label String\n}',
    );
    writeFixture(
      'apps/server/api/src/collections/videos/schemas/video.schema.ts',
      "export type { Video as VideoDocument } from '@genfeedai/prisma';",
    );
    writeFixture(
      'packages/serializers/src/attributes/content/video.attributes.ts',
      [
        "import { createEntityAttributes } from '@genfeedai/helpers';",
        "export const videoAttributes = createEntityAttributes(['label']);",
      ].join('\n'),
    );
    writeFixture(
      'packages/serializers/src/configs/content/video.config.ts',
      [
        "import { videoAttributes } from '@serializers/attributes/content/video.attributes';",
        "export const videoSerializerConfig = { attributes: videoAttributes, type: 'video' };",
      ].join('\n'),
    );
    writeFixture(
      'packages/serializers/src/server/content/video.serializer.ts',
      [
        "import { buildSerializer } from '@serializers/builders';",
        "import { videoSerializerConfig } from '@serializers/configs/content/video.config';",
        "const SERVER_VIDEO_ATTRIBUTES = ['codec'];",
        'const SERVER_VIDEO_CONFIG = {',
        '  ...videoSerializerConfig,',
        '  attributes: [...videoSerializerConfig.attributes, ...SERVER_VIDEO_ATTRIBUTES],',
        '};',
        "export const { VideoSerializer } = buildSerializer('server', SERVER_VIDEO_CONFIG);",
      ].join('\n'),
    );

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toEqual([
      expect.objectContaining({ unbackedFields: ['codec'] }),
    ]);
    expect(result.matchedCount).toBe(1);
  });

  it('discovers multiple Prisma documents declared in one schema file', () => {
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      [
        'model SocialConversation {',
        '  id String @id',
        '  label String',
        '}',
        'model SocialMessage {',
        '  id String @id',
        '  body String',
        '}',
      ].join('\n'),
    );
    writeFixture(
      'apps/server/api/src/collections/social-inbox/schemas/social-inbox.schema.ts',
      [
        "import type { SocialConversation as PrismaSocialConversation, SocialMessage as PrismaSocialMessage } from '@genfeedai/prisma';",
        'export type SocialConversationDocument = PrismaSocialConversation & { _id: string; };',
        'export type SocialMessageDocument = PrismaSocialMessage & { _id: string; };',
      ].join('\n'),
    );
    writeSimpleTriplet('social-conversation', 'socialConversation', 'label');
    writeSimpleTriplet('social-message', 'socialMessage', 'body');

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.matchedCount).toBe(2);
  });

  it('resolves the attribute selected by the canonical serializer triplet', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'] });
    writeFixture(
      'packages/serializers/src/attributes/other/widget.attributes.ts',
      [
        "import { createEntityAttributes } from '@genfeedai/helpers';",
        "export const unrelatedWidgetAttributes = createEntityAttributes(['ghost']);",
      ].join('\n'),
    );

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toHaveLength(0);
    expect(result.matchedCount).toBe(1);
  });

  it('reports serializer fields that have no model, document, or relationship backing', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label', 'ghost'] });

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.drifts).toEqual([
      expect.objectContaining({ unbackedFields: ['ghost'] }),
    ]);
  });

  it('fails closed when discovery unexpectedly covers zero schemas', () => {
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      'model Widget {\n  id String @id\n}',
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.errors).toContain(
      'No Prisma-backed schema candidates were discovered',
    );
    expect(result.errors).toContain(
      'Unexpected zero coverage: no schema/serializer pairs were matched',
    );
  });

  it('fails closed when full-run matching drops a contracted pair', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      projections: { 'missing:Missing': [] },
      rootDir: fixtureRoot,
    });

    expect(result.errors).toContain(
      'Projection contract missing:Missing is stale: no matched schema/serializer pair',
    );
    expect(result.matchedCount).toBe(1);
  });

  it('rejects projection exceptions that become structurally backed', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      projections: { 'widget:Widget': ['label'] },
      rootDir: fixtureRoot,
    });

    expect(result.errors).toContain(
      'Projection contract widget:Widget.label is stale: field is now structurally backed',
    );
  });

  it('fails closed when a selected serializer file matches zero pairs', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      files: ['packages/serializers/src/attributes/demo/missing.attributes.ts'],
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.errors).toEqual([
      expect.stringContaining(
        'Unexpected zero coverage for selected serializer/schema files',
      ),
    ]);
  });

  it('checks all matched pairs when the canonical Prisma schema is selected', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      files: ['packages/prisma/prisma/schema.prisma'],
      projections: {},
      rootDir: fixtureRoot,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.matchedCount).toBe(1);
  });

  it('treats selected non-Prisma schema files as an intentional skip', () => {
    writeBaseFixture();
    writeFixture(
      'apps/server/api/src/collections/widgets/schemas/widget.schema.ts',
      "export type { Widget as WidgetDocument } from '@genfeedai/prisma';",
    );
    writeFixture(
      'apps/server/api/src/services/runtime/schemas/runtime.schema.ts',
      'export type RuntimeSchema = Record<string, unknown>;',
    );
    writeSerializerTriplet({ fields: ['label'] });

    const result = runCheckSerializerDrift({
      files: ['apps/server/api/src/services/runtime/schemas/runtime.schema.ts'],
      projections: { 'other:Other': ['computed'] },
      rootDir: fixtureRoot,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.matchedCount).toBe(0);
  });

  function writeBaseFixture(): void {
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      [
        'model Widget {',
        '  id      String @id',
        '  label   String',
        '  payload Json?',
        '}',
      ].join('\n'),
    );
  }

  function writeSerializerTriplet(options: {
    fields: string[];
    useBarrels?: boolean;
  }): void {
    const fields = options.fields.map((field) => `'${field}'`).join(', ');
    writeFixture(
      'packages/serializers/src/attributes/demo/widget.attributes.ts',
      [
        "import { createEntityAttributes } from '@genfeedai/helpers';",
        `export const widgetAttributes: string[] = createEntityAttributes([${fields}]);`,
      ].join('\n'),
    );
    writeFixture(
      'packages/serializers/src/configs/demo/widget.config.ts',
      [
        "import { widgetAttributes } from '@serializers/attributes/demo/widget.attributes';",
        "export const widgetSerializerConfig = { attributes: widgetAttributes, type: 'widget' };",
      ].join('\n'),
    );

    if (options.useBarrels) {
      writeFixture(
        'packages/serializers/src/attributes/index.ts',
        "export * from './demo/widget.attributes';",
      );
      writeFixture(
        'packages/serializers/src/configs/index.ts',
        "export * from './demo/widget.config';",
      );
    }

    writeFixture(
      'packages/serializers/src/server/demo/widget.serializer.ts',
      [
        "import { buildSerializer } from '@serializers/builders';",
        options.useBarrels
          ? "import { widgetSerializerConfig } from '@serializers/configs';"
          : "import { widgetSerializerConfig } from '@serializers/configs/demo/widget.config';",
        "export const { WidgetSerializer } = buildSerializer('server', widgetSerializerConfig);",
      ].join('\n'),
    );
  }

  function writeSimpleTriplet(
    basename: string,
    symbolPrefix: string,
    field: string,
  ): void {
    writeFixture(
      `packages/serializers/src/attributes/social/${basename}.attributes.ts`,
      [
        "import { createEntityAttributes } from '@genfeedai/helpers';",
        `export const ${symbolPrefix}Attributes = createEntityAttributes(['${field}']);`,
      ].join('\n'),
    );
    writeFixture(
      `packages/serializers/src/configs/social/${basename}.config.ts`,
      [
        `import { ${symbolPrefix}Attributes } from '@serializers/attributes/social/${basename}.attributes';`,
        `export const ${symbolPrefix}SerializerConfig = { attributes: ${symbolPrefix}Attributes, type: '${basename}' };`,
      ].join('\n'),
    );
    writeFixture(
      `packages/serializers/src/server/social/${basename}.serializer.ts`,
      [
        "import { buildSerializer } from '@serializers/builders';",
        `import { ${symbolPrefix}SerializerConfig } from '@serializers/configs/social/${basename}.config';`,
        `export const { ${symbolPrefix[0]?.toUpperCase()}${symbolPrefix.slice(1)}Serializer } = buildSerializer('server', ${symbolPrefix}SerializerConfig);`,
      ].join('\n'),
    );
  }

  function writeFixture(relativePath: string, content: string): void {
    const filePath = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
});
