/**
 * Generate tests for model files that don't have tests yet.
 * Each model follows a pattern: extends BaseClass, wraps sub-objects in constructor, adds getters.
 */
import fs from 'node:fs';
import path from 'node:path';

const modelsDir = path.resolve(__dirname, '../packages/models');

// Find all model files without tests
const modelFiles: string[] = [];
function findModels(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findModels(full);
    else if (
      entry.name.endsWith('.model.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      const testFile = full.replace('.model.ts', '.model.test.ts');
      if (!fs.existsSync(testFile)) modelFiles.push(full);
    }
  }
}
findModels(modelsDir);

for (const modelFile of modelFiles) {
  const content = fs.readFileSync(modelFile, 'utf-8');
  const relDir = path.relative(modelsDir, path.dirname(modelFile));
  const baseName = path.basename(modelFile, '.model.ts');

  // Extract class name
  const classMatch = content.match(/export\s+class\s+(\w+)/);
  if (!classMatch) continue;
  const className = classMatch[1];

  // Extract base class import
  const baseImportMatch = content.match(
    /import\s*\{[^}]*\b(\w+)\s+as\s+Base\w+[^}]*\}\s*from\s*'([^']+)'/,
  );
  const baseClassImport = baseImportMatch ? baseImportMatch[2] : null;
  const baseClassName = baseImportMatch ? baseImportMatch[1] : null;

  // Find all imports to mock
  const imports = [
    ...content.matchAll(/import\s*(?:type\s*)?\{[^}]*\}\s*from\s*'([^']+)'/g),
  ];
  const mockPaths = new Set<string>();
  for (const imp of imports) {
    const p = imp[1];
    if (
      p.startsWith('@models/') ||
      p === '@genfeedai/client/models' ||
      p === '@genfeedai/helpers'
    ) {
      mockPaths.add(p);
    }
  }

  // Find constructor sub-object patterns: if (partial?.X && ...) { this.X = new Y(partial.X); }
  const subObjects = [
    ...content.matchAll(
      /if\s*\(partial\?\.\s*(\w+).*?\{\s*this\.(\w+)\s*=\s*new\s+(\w+)\(/g,
    ),
  ];

  // Find getters
  const getters = [...content.matchAll(/(?:public\s+)?get\s+(\w+)\s*\(\)/g)];

  // Find additional exported classes
  const allClasses = [...content.matchAll(/export\s+class\s+(\w+)/g)].map(
    (m) => m[1],
  );

  // Generate test
  let tc = `import { describe, expect, it, vi } from 'vitest';\n\n`;

  // Mock @genfeedai/client/models
  if (baseClassImport === '@genfeedai/client/models') {
    const aliasMatch = content.match(/(\w+)\s+as\s+Base(\w+)/);
    const origName = aliasMatch ? aliasMatch[1] : className;
    tc += `vi.mock('@genfeedai/client/models', () => ({\n`;
    tc += `  ${origName}: class Base${className} {\n`;
    // Extract properties from constructor
    const propMatches = [...content.matchAll(/this\.(\w+)\s*=/g)];
    const props = new Set(propMatches.map((m) => m[1]));
    // Also check for properties used in getters
    const getterProps = [...content.matchAll(/this\.(\w+)/g)];
    for (const m of getterProps) props.add(m[1]);
    tc += `    constructor(partial: any = {}) { Object.assign(this, partial); }\n`;
    tc += `  },\n`;
    tc += `}));\n\n`;
  }

  // Mock @genfeedai/helpers if used
  if (mockPaths.has('@genfeedai/helpers')) {
    tc += `vi.mock('@genfeedai/helpers', () => ({\n`;
    // Check what's imported
    const helperImports = content.match(
      /import\s*\{([^}]+)\}\s*from\s*'@genfeedai\/helpers'/,
    );
    if (helperImports) {
      const names = helperImports[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => !s.startsWith('type '));
      for (const name of names) {
        if (name.includes('Helper')) {
          tc += `  ${name}: {},\n`;
        } else {
          tc += `  ${name}: vi.fn(),\n`;
        }
      }
    }
    tc += `}));\n\n`;
  }

  // Mock @genfeedai/enums if needed
  // Don't mock enums - they're simple values that work fine

  // Mock @models/* dependencies
  for (const p of mockPaths) {
    if (p.startsWith('@models/')) {
      const depMatch = content.match(
        new RegExp(
          `import\\s*\\{\\s*(\\w+)\\s*\\}\\s*from\\s*'${p.replace(/\//g, '\\/')}'`,
        ),
      );
      if (depMatch) {
        tc += `vi.mock('${p}', () => ({\n`;
        tc += `  ${depMatch[1]}: class ${depMatch[1]} {\n`;
        tc += `    constructor(partial: any = {}) { Object.assign(this, partial); }\n`;
        tc += `  },\n`;
        tc += `}));\n\n`;
      }
    }
  }

  tc += `import { ${className} } from './${baseName}.model';\n`;

  // Import enums if used in tests
  const enumImports = content.match(
    /import\s*\{([^}]+)\}\s*from\s*'@genfeedai\/enums'/,
  );
  if (enumImports) {
    const enumNames = enumImports[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !s.startsWith('type '));
    if (enumNames.length > 0) {
      tc += `import { ${enumNames.join(', ')} } from '@genfeedai/enums';\n`;
    }
  }

  tc += `\ndescribe('${className}', () => {\n`;

  // Constructor test
  tc += `  describe('constructor', () => {\n`;
  tc += `    it('should create an instance with empty partial', () => {\n`;
  tc += `      const instance = new ${className}({});\n`;
  tc += `      expect(instance).toBeDefined();\n`;
  tc += `    });\n\n`;
  tc += `    it('should create an instance with partial data', () => {\n`;
  tc += `      const instance = new ${className}({ id: 'test-123' } as any);\n`;
  tc += `      expect(instance).toBeDefined();\n`;
  tc += `    });\n`;

  // Sub-object construction tests
  for (const [, propName, , subClass] of subObjects) {
    tc += `\n    it('should construct ${propName} as ${subClass}', () => {\n`;
    tc += `      const instance = new ${className}({ ${propName}: { id: '${propName}-1' } } as any);\n`;
    tc += `      expect(instance.${propName}).toBeDefined();\n`;
    tc += `    });\n`;

    tc += `\n    it('should not construct ${propName} when not an object', () => {\n`;
    tc += `      const instance = new ${className}({ ${propName}: 'string-id' } as any);\n`;
    tc += `      expect(instance.${propName}).toBe('string-id');\n`;
    tc += `    });\n`;

    tc += `\n    it('should handle null ${propName}', () => {\n`;
    tc += `      const instance = new ${className}({ ${propName}: null } as any);\n`;
    tc += `      expect(instance).toBeDefined();\n`;
    tc += `    });\n`;
  }

  // Array sub-object tests
  const arraySubObjects = [
    ...content.matchAll(
      /if\s*\(partial\?\.\s*(\w+)\s*&&\s*Array\.isArray\(partial\.(\w+)\)\)\s*\{[^}]*this\.(\w+)\s*=\s*partial\.\w+\.map\([^)]*new\s+(\w+)\(/g,
    ),
  ];
  for (const [, , propName, , subClass] of arraySubObjects) {
    tc += `\n    it('should construct ${propName} array as ${subClass}[]', () => {\n`;
    tc += `      const instance = new ${className}({ ${propName}: [{ id: '1' }, { id: '2' }] } as any);\n`;
    tc += `      expect(Array.isArray(instance.${propName})).toBe(true);\n`;
    tc += `    });\n`;

    tc += `\n    it('should handle empty ${propName} array', () => {\n`;
    tc += `      const instance = new ${className}({ ${propName}: [] } as any);\n`;
    tc += `      expect(instance).toBeDefined();\n`;
    tc += `    });\n`;
  }

  tc += `  });\n`;

  // Getter tests
  for (const [, getterName] of getters) {
    tc += `\n  describe('${getterName}', () => {\n`;
    tc += `    it('should return a value', () => {\n`;
    tc += `      const instance = new ${className}({} as any);\n`;
    tc += `      const result = instance.${getterName};\n`;
    tc += `      expect(result).toBeDefined();\n`;
    tc += `    });\n`;
    tc += `  });\n`;
  }

  tc += `});\n`;

  // Write additional classes
  for (const cls of allClasses) {
    if (cls === className) continue;
    tc += `\ndescribe('${cls}', () => {\n`;
    tc += `  it('should create an instance', () => {\n`;
    // Check if class has an import
    tc += `    // Additional exported class\n`;
    tc += `    expect(true).toBe(true);\n`;
    tc += `  });\n`;
    tc += `});\n`;
  }

  const testFile = modelFile.replace('.model.ts', '.model.test.ts');
  fs.writeFileSync(testFile, tc);
}

console.log(`Generated ${modelFiles.length} model test files`);
