/**
 * Static analysis utilities for parsing NestJS module files.
 * Used by database architecture test suites.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively find files matching a filename pattern
 */
export function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findFiles(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse a module file and extract all Mongoose forFeature/forFeatureAsync calls,
 * returning model names and their associated connection.
 *
 * NOTE: After the Prisma migration this function will return empty results for
 * fully-migrated modules. It is retained for modules that still use Mongoose
 * (e.g., agent-threading, analytics) until those are migrated.
 */
export function extractForFeatureCalls(
  content: string,
): Array<{ connection: string; models: string[] }> {
  const results: Array<{ connection: string; models: string[] }> = [];
  // Match both MongooseModule.forFeature and MongooseModule.forFeatureAsync
  const regex = /MongooseModule\.forFeature(?:Async)?\(/g;
  let match = regex.exec(content);

  while (match !== null) {
    const startIdx = match.index + match[0].length;
    let depth = 1;
    let idx = startIdx;

    // Find matching closing paren using bracket counting
    while (idx < content.length && depth > 0) {
      if (content[idx] === '(') {
        depth++;
      }
      if (content[idx] === ')') {
        depth--;
      }
      idx++;
    }

    const callContent = content.substring(startIdx, idx - 1);

    // Extract model names from: name: ModelName.name
    const models: string[] = [];
    const modelRegex = /name:\s*(\w+)\.name/g;
    let modelMatch = modelRegex.exec(callContent);
    while (modelMatch !== null) {
      models.push(modelMatch[1]);
      modelMatch = modelRegex.exec(callContent);
    }

    // Extract connection: find DB_CONNECTIONS.X after the closing ] of the array arg
    const lastBracketIdx = callContent.lastIndexOf(']');
    const afterBracket =
      lastBracketIdx >= 0 ? callContent.substring(lastBracketIdx) : '';
    const connMatch = afterBracket.match(/DB_CONNECTIONS\.(\w+)/);
    const connection = connMatch ? connMatch[1] : 'CLOUD';

    if (models.length > 0) {
      results.push({ connection, models });
    }
    match = regex.exec(content);
  }

  return results;
}

/**
 * Build the full model → connection mapping from all module files
 * in the given source directory.
 */
export function buildModelConnectionMap(
  apiSrcDir: string,
): Record<string, string> {
  const moduleFiles = findFiles(apiSrcDir, /\.module\.ts$/);
  const mapping: Record<string, string> = {};

  for (const file of moduleFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const calls = extractForFeatureCalls(content);

    for (const call of calls) {
      for (const model of call.models) {
        if (mapping[model] && mapping[model] !== call.connection) {
          throw new Error(
            `Model "${model}" registered on multiple connections: ` +
              `"${mapping[model]}" and "${call.connection}" in ${path.relative(apiSrcDir, file)}`,
          );
        }
        mapping[model] = call.connection;
      }
    }
  }

  return mapping;
}
