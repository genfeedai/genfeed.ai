/**
 * Cross-Connection Populate Guard Tests
 *
 * Prevents cross-connection virtual populate definitions — the exact bug
 * from Session 7 (2026-02-13) where Organization (auth) had a virtual
 * referencing Asset (cloud), causing silent empty results in production.
 *
 * Scans module files for schema.virtual() definitions and verifies
 * the ref model is on the same connection as the parent model.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  buildModelConnectionMap,
  findFiles,
} from '@api/__tests__/helpers/module-parser';

const API_SRC = path.resolve(__dirname, '..');

interface VirtualPopulate {
  connection: string;
  file: string;
  parentModel: string;
  refConnection: string;
  refModel: string;
  virtualName: string;
}

/**
 * Extract virtual populate definitions from a module file.
 * Returns virtual populates with their parent model and ref model.
 */
function extractVirtualPopulates(
  content: string,
  filePath: string,
  modelMap: Record<string, string>,
): VirtualPopulate[] {
  const results: VirtualPopulate[] = [];

  // Find the parent model names from forFeature/forFeatureAsync calls
  const modelNameRegex = /name:\s*(\w+)\.name/g;
  const parentModels: string[] = [];
  let modelMatch = modelNameRegex.exec(content);
  while (modelMatch !== null) {
    parentModels.push(modelMatch[1]);
    modelMatch = modelNameRegex.exec(content);
  }

  // Find virtual populate definitions: schema.virtual('name', { ref: 'ModelName', ... })
  const virtualRegex =
    /schema\.virtual\(\s*'(\w+)'\s*,\s*\{([^}]*ref:\s*'(\w+)'[^}]*)\}/g;
  let virtualMatch = virtualRegex.exec(content);

  while (virtualMatch !== null) {
    const virtualName = virtualMatch[1];
    const refModel = virtualMatch[3];

    // Determine which parent model this virtual belongs to by finding the
    // nearest preceding name: X.name declaration
    let parentModel = 'unknown';
    let bestPos = -1;

    for (const pm of parentModels) {
      const pmPattern = new RegExp(`name:\\s*${pm}\\.name`, 'g');
      let pmMatch = pmPattern.exec(content);
      while (pmMatch !== null) {
        if (pmMatch.index < virtualMatch.index && pmMatch.index > bestPos) {
          bestPos = pmMatch.index;
          parentModel = pm;
        }
        pmMatch = pmPattern.exec(content);
      }
    }

    const parentConnection = modelMap[parentModel] ?? 'CLOUD';
    const refConnection = modelMap[refModel] ?? 'CLOUD';

    results.push({
      connection: parentConnection,
      file: path.relative(API_SRC, filePath),
      parentModel,
      refConnection,
      refModel,
      virtualName,
    });
    virtualMatch = virtualRegex.exec(content);
  }

  return results;
}

describe('Cross-Connection Populate Guard', () => {
  let modelMap: Record<string, string>;

  beforeAll(() => {
    modelMap = buildModelConnectionMap(API_SRC);
  });

  it('should not have virtual populates that cross database connections', () => {
    const moduleFiles = findFiles(API_SRC, /\.module\.ts$/);
    const violations: VirtualPopulate[] = [];

    for (const file of moduleFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const virtuals = extractVirtualPopulates(content, file, modelMap);

      for (const vp of virtuals) {
        if (vp.connection !== vp.refConnection) {
          violations.push(vp);
        }
      }
    }

    if (violations.length > 0) {
      const messages = violations.map(
        (v) =>
          `  ${v.file}: ${v.parentModel}.${v.virtualName} (${v.connection}) → ` +
          `${v.refModel} (${v.refConnection})`,
      );
      throw new Error(
        `Cross-connection virtual populates detected:\n${messages.join('\n')}\n\n` +
          'Virtual populates cannot span database connections. ' +
          'Use manual lookup queries instead.',
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('should detect explicit cross-connection populate in service files', () => {
    const serviceFiles = findFiles(API_SRC, /\.service\.ts$/);
    const violations: string[] = [];

    for (const file of serviceFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Find .populate({ model: 'ModelName' }) patterns
      const populateModelRegex =
        /\.populate\(\s*\{[^}]*model:\s*'(\w+)'[^}]*\}/g;
      let populateMatch = populateModelRegex.exec(content);

      while (populateMatch !== null) {
        const targetModel = populateMatch[1];
        const targetConnection = modelMap[targetModel];

        if (!targetConnection) {
          populateMatch = populateModelRegex.exec(content);
          continue;
        }

        // Determine the source model from @InjectModel decorators in the service
        const injectModelRegex = /@InjectModel\(\s*(\w+)\.name/g;
        let injectMatch = injectModelRegex.exec(content);

        while (injectMatch !== null) {
          const sourceModel = injectMatch[1];
          const sourceConnection = modelMap[sourceModel] ?? 'CLOUD';

          if (sourceConnection !== targetConnection) {
            const relativePath = path.relative(API_SRC, file);
            violations.push(
              `${relativePath}: ${sourceModel} (${sourceConnection}) populates ` +
                `${targetModel} (${targetConnection})`,
            );
          }
          injectMatch = injectModelRegex.exec(content);
        }
        populateMatch = populateModelRegex.exec(content);
      }
    }

    expect(violations).toEqual([]);
  });
});
