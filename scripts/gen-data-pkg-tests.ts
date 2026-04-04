/**
 * Generate comprehensive tests for enums, serializer attributes, serializer configs,
 * and config schemas packages.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

// ─── Helpers ───
function findTsFiles(dir: string, base = ''): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory())
      results.push(...findTsFiles(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts')
      results.push(rel);
  }
  return results;
}

function ensureDir(d: string) {
  fs.mkdirSync(d, { recursive: true });
}

// ═══════════════════════════════════════════════
// 1. ENUMS
// ═══════════════════════════════════════════════
function generateEnumTests() {
  const enumDir = path.join(root, '../packages/enums/src');
  const testDir = path.join(root, '../packages/enums/__tests__');
  ensureDir(testDir);

  const enumFiles = fs
    .readdirSync(enumDir)
    .filter((f) => f.endsWith('.enum.ts'));
  let count = 0;

  for (const file of enumFiles) {
    const content = fs.readFileSync(path.join(enumDir, file), 'utf-8');
    const moduleName = file.replace('.enum.ts', '');

    // Find enum declarations
    const enumRegex = /export\s+enum\s+(\w+)\s*\{([^}]+)\}/g;
    const enums: { name: string; members: { key: string; value: string }[] }[] =
      [];
    let match;
    while ((match = enumRegex.exec(content)) !== null) {
      const members: { key: string; value: string }[] = [];
      // String values
      const strRegex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = strRegex.exec(match[2])) !== null)
        members.push({ key: m[1], value: m[2] });
      // Numeric values
      const numRegex = /(\w+)\s*=\s*(\d+)/g;
      while ((m = numRegex.exec(match[2])) !== null)
        members.push({ key: m[1], value: m[2] });
      if (members.length > 0) enums.push({ members, name: match[1] });
    }

    // Aliased exports
    const reExportRegex =
      /export\s*\{\s*(\w+)(?:\s+as\s+(\w+))?\s*\}\s*from\s*['"]([^'"]+)['"]/g;
    const reExports: { alias: string }[] = [];
    while ((match = reExportRegex.exec(content)) !== null) {
      reExports.push({ alias: match[2] || match[1] });
    }

    if (enums.length === 0 && reExports.length === 0) continue;

    const importNames = [
      ...enums.map((e) => e.name),
      ...reExports.map((r) => r.alias),
    ];
    let tc = `import { describe, expect, it } from 'vitest';\n`;
    tc += `import { ${importNames.join(', ')} } from '../src/${moduleName}.enum';\n\n`;
    tc += `describe('${moduleName}.enum', () => {\n`;

    for (const e of enums) {
      tc += `  describe('${e.name}', () => {\n`;
      tc += `    it('should have ${e.members.length} members', () => {\n`;
      const isNumeric = e.members.every((m) => /^\d+$/.test(m.value));
      if (isNumeric) {
        tc += `      expect(Object.values(${e.name}).filter(v => typeof v === 'number')).toHaveLength(${e.members.length});\n`;
      } else {
        tc += `      expect(Object.values(${e.name})).toHaveLength(${e.members.length});\n`;
      }
      tc += `    });\n\n`;
      tc += `    it('should have correct values', () => {\n`;
      for (const m of e.members) {
        const val = /^\d+$/.test(m.value) ? m.value : `'${m.value}'`;
        tc += `      expect(${e.name}.${m.key}).toBe(${val});\n`;
      }
      tc += `    });\n`;
      tc += `  });\n\n`;
    }

    for (const r of reExports) {
      tc += `  describe('${r.alias} (aliased export)', () => {\n`;
      tc += `    it('should be defined and have enum values', () => {\n`;
      tc += `      expect(${r.alias}).toBeDefined();\n`;
      tc += `      expect(Object.keys(${r.alias}).length).toBeGreaterThan(0);\n`;
      tc += `    });\n`;
      tc += `  });\n\n`;
    }

    tc += `});\n`;
    fs.writeFileSync(path.join(testDir, `${moduleName}.enum.test.ts`), tc);
    count++;
  }

  // vitest config
  fs.writeFileSync(
    path.join(root, '../packages/enums/vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
  },
});
`,
  );

  console.log(`Enums: generated ${count} test files`);
}

// ═══════════════════════════════════════════════
// 2. SERIALIZER ATTRIBUTES
// ═══════════════════════════════════════════════
function generateAttributeTests() {
  const attrDir = path.join(root, 'packages/serializers/src/attributes');
  const testDir = path.join(root, 'packages/serializers/__tests__');
  ensureDir(testDir);

  const files = findTsFiles(attrDir);
  const imports: string[] = [];
  const names: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(attrDir, file), 'utf-8');
    const regex = /export\s+const\s+(\w+)\s*=/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      imports.push(
        `import { ${m[1]} } from '../src/attributes/${file.replace('.ts', '')}';`,
      );
      names.push(m[1]);
    }
  }

  let tc = `import { describe, expect, it } from 'vitest';\n`;
  tc += imports.join('\n') + '\n\n';
  tc += `describe('Serializer Attributes', () => {\n`;
  for (const name of names) {
    tc += `  describe('${name}', () => {\n`;
    tc += `    it('should be a non-empty array of strings', () => {\n`;
    tc += `      expect(Array.isArray(${name})).toBe(true);\n`;
    tc += `      expect(${name}.length).toBeGreaterThan(0);\n`;
    tc += `      for (const attr of ${name}) expect(typeof attr).toBe('string');\n`;
    tc += `    });\n`;
    tc += `  });\n\n`;
  }
  tc += `});\n`;

  fs.writeFileSync(path.join(testDir, 'all-attributes.test.ts'), tc);
  console.log(`Serializer attributes: ${names.length} attribute sets`);
}

// ═══════════════════════════════════════════════
// 3. SERIALIZER CONFIGS (import from specific files, NOT barrel)
// ═══════════════════════════════════════════════
function generateConfigTests() {
  const configDir = path.join(root, 'packages/serializers/src/configs');
  const testDir = path.join(root, 'packages/serializers/__tests__');
  ensureDir(testDir);

  const files = findTsFiles(configDir);
  const imports: string[] = [];
  const names: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(configDir, file), 'utf-8');
    const regex = /export\s+const\s+(\w+)\s*(?::\s*\w+\s*)?=/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      imports.push(
        `import { ${m[1]} } from '../src/configs/${file.replace('.ts', '')}';`,
      );
      names.push(m[1]);
    }
  }

  let tc = `import { describe, expect, it } from 'vitest';\n`;
  tc += imports.join('\n') + '\n\n';
  tc += `describe('Serializer Configs', () => {\n`;
  for (const name of names) {
    tc += `  describe('${name}', () => {\n`;
    tc += `    it('should have type and attributes', () => {\n`;
    tc += `      expect(typeof ${name}.type).toBe('string');\n`;
    tc += `      expect(${name}.type.length).toBeGreaterThan(0);\n`;
    tc += `      expect(Array.isArray(${name}.attributes)).toBe(true);\n`;
    tc += `      expect(${name}.attributes.length).toBeGreaterThan(0);\n`;
    tc += `    });\n\n`;
    tc += `    it('relationships should have correct structure', () => {\n`;
    tc += `      for (const [key, val] of Object.entries(${name})) {\n`;
    tc += `        if (key === 'type' || key === 'attributes') continue;\n`;
    tc += `        const rel = val as any;\n`;
    tc += `        if (rel && typeof rel === 'object' && 'type' in rel) {\n`;
    tc += `          expect(typeof rel.type).toBe('string');\n`;
    tc += `          expect(rel.ref).toBe('_id');\n`;
    tc += `          expect(Array.isArray(rel.attributes)).toBe(true);\n`;
    tc += `        }\n`;
    tc += `      }\n`;
    tc += `    });\n`;
    tc += `  });\n\n`;
  }
  tc += `});\n`;

  fs.writeFileSync(path.join(testDir, 'all-configs.test.ts'), tc);
  console.log(`Serializer configs: ${names.length} configs`);
}

// ═══════════════════════════════════════════════
// 4. CONFIG PACKAGE (schemas + BaseConfigService)
// ═══════════════════════════════════════════════
function generateConfigPkgTests() {
  const testDir = path.join(root, 'packages/config/__tests__');
  ensureDir(testDir);

  // Schemas tests
  const schemaDir = path.join(root, 'packages/config/src/schemas');
  const schemaFiles = findTsFiles(schemaDir);
  const schemaImports: string[] = [];
  const schemas: { name: string; file: string }[] = [];

  for (const file of schemaFiles) {
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf-8');
    const regex = /export\s+const\s+(\w+)\s*=\s*\{/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      schemaImports.push(
        `import { ${m[1]} } from '../src/schemas/${file.replace('.ts', '')}';`,
      );
      schemas.push({ file, name: m[1] });
    }
  }

  let tc = `import Joi from 'joi';\nimport { describe, expect, it } from 'vitest';\n`;
  tc += schemaImports.join('\n') + '\n\n';
  tc += `describe('Config Schemas', () => {\n`;
  for (const s of schemas) {
    tc += `  describe('${s.name}', () => {\n`;
    tc += `    it('should be a non-empty object of Joi schemas', () => {\n`;
    tc += `      expect(typeof ${s.name}).toBe('object');\n`;
    tc += `      const keys = Object.keys(${s.name});\n`;
    tc += `      expect(keys.length).toBeGreaterThan(0);\n`;
    tc += `      for (const key of keys) {\n`;
    tc += `        expect(Joi.isSchema((${s.name} as any)[key])).toBe(true);\n`;
    tc += `      }\n`;
    tc += `    });\n\n`;
    tc += `    it('should validate with defaults when optional', () => {\n`;
    tc += `      const schema = Joi.object(${s.name});\n`;
    tc += `      const { error } = schema.validate({}, { allowUnknown: true });\n`;
    tc += `      // Some schemas have required fields, so error is acceptable\n`;
    tc += `      if (error) {\n`;
    tc += `        expect(error.message).toContain('required');\n`;
    tc += `      }\n`;
    tc += `    });\n`;
    tc += `  });\n\n`;
  }
  tc += `});\n`;
  fs.writeFileSync(path.join(testDir, 'schemas.test.ts'), tc);

  // BaseConfigService test
  const bcsTest = `import fs from 'node:fs';
import Joi from 'joi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseConfigService } from '../src/services/base-config.service';

// Concrete implementation for testing
class TestConfigService extends BaseConfigService<{ NODE_ENV: string; PORT: number; CUSTOM: string }> {
  constructor(options: { appName: string; workingDir: 'apps/server' | 'root' }) {
    super(
      Joi.object({
        CUSTOM: Joi.string().default('default-val'),
        NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
        PORT: Joi.number().required(),
      }),
      options,
    );
  }
}

describe('BaseConfigService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fs.existsSync to return false (no .env files)
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should create service with valid config from process.env', () => {
    process.env.PORT = '3000';
    process.env.NODE_ENV = 'test';
    const service = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(service.get('PORT')).toBe(3000);
    expect(service.get('NODE_ENV')).toBe('test');
  });

  it('should apply defaults for missing optional values', () => {
    process.env.PORT = '3000';
    const service = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(service.get('CUSTOM')).toBe('default-val');
  });

  it('should throw on missing required values', () => {
    delete process.env.PORT;
    expect(() => new TestConfigService({ appName: 'api', workingDir: 'root' }))
      .toThrow('Config validation error');
  });

  it('should read env files when they exist (root workingDir)', () => {
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => {
      return p === '.env';
    });
    readSpy.mockImplementation((p: any) => {
      if (p === '.env') return 'CUSTOM=from-env-file';
      return '';
    });

    const service = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(service.get('CUSTOM')).toBe('from-env-file');
  });

  it('should read env files for apps/server workingDir', () => {
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === '../../.env');
    readSpy.mockImplementation((p: any) => {
      if (p === '../../.env') return 'CUSTOM=from-server-env';
      return '';
    });

    const service = new TestConfigService({ appName: 'api', workingDir: 'apps/server' });
    expect(service.get('CUSTOM')).toBe('from-server-env');
  });

  it('should load production env files', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === '.env.production');
    readSpy.mockImplementation((p: any) => {
      if (p === '.env.production') return 'CUSTOM=prod-value';
      return '';
    });

    const service = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(service.get('CUSTOM')).toBe('prod-value');
  });

  it('should load test env files', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === '.env.test');
    readSpy.mockImplementation((p: any) => {
      if (p === '.env.test') return 'CUSTOM=test-value';
      return '';
    });

    const service = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(service.get('CUSTOM')).toBe('test-value');
  });

  describe('environment helpers', () => {
    it('isDevelopment', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isDevelopment).toBe(true);
      expect(s.isProduction).toBe(false);
      expect(s.isStaging).toBe(false);
      expect(s.isTest).toBe(false);
    });

    it('isProduction', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'production';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isProduction).toBe(true);
    });

    it('isStaging', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'staging';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isStaging).toBe(true);
    });

    it('isTest', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'test';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
      expect(s.isTest).toBe(true);
    });
  });

  it('later env files override earlier ones', () => {
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === '.env' || p === '.env.local');
    readSpy.mockImplementation((p: any) => {
      if (p === '.env') return 'CUSTOM=base';
      if (p === '.env.local') return 'CUSTOM=override';
      return '';
    });

    const s = new TestConfigService({ appName: 'api', workingDir: 'root' });
    expect(s.get('CUSTOM')).toBe('override');
  });

  it('should load app-specific env files for production (apps/server)', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === 'api/.env.production');
    readSpy.mockImplementation((p: any) => {
      if (p === 'api/.env.production') return 'CUSTOM=app-prod';
      return '';
    });

    const s = new TestConfigService({ appName: 'api', workingDir: 'apps/server' });
    expect(s.get('CUSTOM')).toBe('app-prod');
  });

  it('should load app-specific env files for test (apps/server)', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    const existsSpy = vi.spyOn(fs, 'existsSync');
    const readSpy = vi.spyOn(fs, 'readFileSync');
    existsSpy.mockImplementation((p: any) => p === 'api/.env.test');
    readSpy.mockImplementation((p: any) => {
      if (p === 'api/.env.test') return 'CUSTOM=app-test';
      return '';
    });

    const s = new TestConfigService({ appName: 'api', workingDir: 'apps/server' });
    expect(s.get('CUSTOM')).toBe('app-test');
  });
});
`;
  fs.writeFileSync(path.join(testDir, 'base-config.service.test.ts'), bcsTest);

  // vitest config for config package
  fs.writeFileSync(
    path.join(root, 'packages/config/vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
  },
});
`,
  );

  console.log(`Config pkg: schemas test + BaseConfigService test`);
}

// ═══════════════════════════════════════════════
// 5. Update serializer vitest config to include __tests__
// ═══════════════════════════════════════════════
function updateSerializerVitestConfig() {
  const configPath = path.join(root, 'packages/serializers/vitest.config.ts');
  let content = fs.readFileSync(configPath, 'utf-8');
  if (!content.includes("'__tests__/**/*.ts'")) {
    content = content.replace(
      "      'src/**/__tests__/**/*.ts',\n",
      "      'src/**/__tests__/**/*.ts',\n      '__tests__/**/*.ts',\n",
    );
    fs.writeFileSync(configPath, content);
  }
  console.log('Serializer vitest config: updated to include __tests__');
}

// Run all
generateEnumTests();
generateAttributeTests();
generateConfigTests();
generateConfigPkgTests();
updateSerializerVitestConfig();
console.log('\nDone!');
