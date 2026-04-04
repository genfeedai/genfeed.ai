/**
 * Generate comprehensive enum tests for all enum files
 */
import fs from 'node:fs';
import path from 'node:path';

const enumDir = path.resolve(__dirname, '../../packages/enums/src');
const testDir = path.resolve(__dirname, '../../packages/enums/__tests__');

fs.mkdirSync(testDir, { recursive: true });

const enumFiles = fs
  .readdirSync(enumDir)
  .filter((f) => f.endsWith('.enum.ts') && f !== 'index.ts');

for (const file of enumFiles) {
  const content = fs.readFileSync(path.join(enumDir, file), 'utf-8');

  // Find all enum declarations
  const enumRegex = /export\s+enum\s+(\w+)\s*\{([^}]+)\}/g;
  const enums: { name: string; members: { key: string; value: string }[] }[] =
    [];

  let match;
  while ((match = enumRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const members: { key: string; value: string }[] = [];

    const memberRegex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let memberMatch;
    while ((memberMatch = memberRegex.exec(body)) !== null) {
      members.push({ key: memberMatch[1], value: memberMatch[2] });
    }

    // Also handle numeric enums
    const numMemberRegex = /(\w+)\s*=\s*(\d+)/g;
    while ((memberMatch = numMemberRegex.exec(body)) !== null) {
      members.push({ key: memberMatch[1], value: memberMatch[2] });
    }

    if (members.length > 0) {
      enums.push({ members, name });
    }
  }

  // Check for aliased exports
  const reExportRegex =
    /export\s*\{\s*(\w+)(?:\s+as\s+(\w+))?\s*\}\s*from\s*['"]([^'"]+)['"]/g;
  const reExports: { original: string; alias: string; from: string }[] = [];
  while ((match = reExportRegex.exec(content)) !== null) {
    reExports.push({
      alias: match[2] || match[1],
      from: match[3],
      original: match[1],
    });
  }

  if (enums.length === 0 && reExports.length === 0) continue;

  const moduleName = file.replace('.enum.ts', '');
  const importPath = `../src/${moduleName}.enum`;

  let testContent = `import { describe, expect, it } from 'vitest';\n`;

  const importNames = [
    ...enums.map((e) => e.name),
    ...reExports.map((r) => r.alias),
  ];

  if (importNames.length > 0) {
    testContent += `import { ${importNames.join(', ')} } from '${importPath}';\n\n`;
  }

  testContent += `describe('${moduleName}.enum', () => {\n`;

  for (const e of enums) {
    testContent += `  describe('${e.name}', () => {\n`;
    testContent += `    it('should have the correct number of members', () => {\n`;
    testContent += `      const values = Object.values(${e.name});\n`;
    // For numeric enums, TypeScript creates reverse mappings, so filter
    const isNumeric = e.members.every((m) => /^\d+$/.test(m.value));
    if (isNumeric) {
      testContent += `      const numericValues = values.filter(v => typeof v === 'number');\n`;
      testContent += `      expect(numericValues).toHaveLength(${e.members.length});\n`;
    } else {
      testContent += `      expect(values).toHaveLength(${e.members.length});\n`;
    }
    testContent += `    });\n\n`;

    testContent += `    it('should have correct values', () => {\n`;
    for (const m of e.members) {
      const val = /^\d+$/.test(m.value) ? m.value : `'${m.value}'`;
      testContent += `      expect(${e.name}.${m.key}).toBe(${val});\n`;
    }
    testContent += `    });\n`;

    testContent += `  });\n\n`;
  }

  for (const r of reExports) {
    testContent += `  describe('${r.alias} (aliased export)', () => {\n`;
    testContent += `    it('should be defined', () => {\n`;
    testContent += `      expect(${r.alias}).toBeDefined();\n`;
    testContent += `    });\n\n`;
    testContent += `    it('should be an object with enum values', () => {\n`;
    testContent += `      expect(typeof ${r.alias}).toBe('object');\n`;
    testContent += `      expect(Object.keys(${r.alias}).length).toBeGreaterThan(0);\n`;
    testContent += `    });\n`;
    testContent += `  });\n\n`;
  }

  testContent += `});\n`;

  fs.writeFileSync(
    path.join(testDir, `${moduleName}.enum.test.ts`),
    testContent,
  );
}

console.log(`Generated tests for ${enumFiles.length} enum files`);
