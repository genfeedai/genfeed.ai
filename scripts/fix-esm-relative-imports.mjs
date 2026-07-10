#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_FILE = /(?:\.[cm]?js|\.d\.[cm]?ts)$/;
const MODULE_SPECIFIER =
  /(\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\()\s*)(['"])([^'"]+)\2/g;
const OUTPUT_EXTENSIONS = ['.js', '.mjs', '.cjs'];

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitSuffix(specifier) {
  const suffixIndex = specifier.search(/[?#]/);
  if (suffixIndex === -1) return [specifier, ''];
  return [specifier.slice(0, suffixIndex), specifier.slice(suffixIndex)];
}

function resolveRelativeSpecifier(filePath, specifier) {
  const [modulePath, suffix] = splitSuffix(specifier);
  const absoluteTarget = path.resolve(path.dirname(filePath), modulePath);

  if (fs.existsSync(absoluteTarget) && fs.statSync(absoluteTarget).isFile()) {
    return specifier;
  }

  for (const extension of OUTPUT_EXTENSIONS) {
    if (fs.existsSync(`${absoluteTarget}${extension}`)) {
      return `${modulePath}${extension}${suffix}`;
    }
  }

  for (const extension of OUTPUT_EXTENSIONS) {
    if (fs.existsSync(path.join(absoluteTarget, `index${extension}`))) {
      return `${modulePath.replace(/\/$/, '')}/index${extension}${suffix}`;
    }
  }

  return specifier;
}

function resolveOutputTarget(absoluteTarget) {
  if (fs.existsSync(absoluteTarget) && fs.statSync(absoluteTarget).isFile()) {
    return absoluteTarget;
  }
  for (const extension of OUTPUT_EXTENSIONS) {
    if (fs.existsSync(`${absoluteTarget}${extension}`)) {
      return `${absoluteTarget}${extension}`;
    }
  }
  for (const extension of OUTPUT_EXTENSIONS) {
    const indexPath = path.join(absoluteTarget, `index${extension}`);
    if (fs.existsSync(indexPath)) return indexPath;
  }
  return null;
}

function projectAliases(projectPath, outputDir) {
  if (!projectPath) return [];
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const projectDir = path.dirname(projectPath);
  const compilerOptions = project.compilerOptions ?? {};
  const baseUrl = path.resolve(projectDir, compilerOptions.baseUrl ?? '.');
  const rootDir = path.resolve(projectDir, compilerOptions.rootDir ?? '.');

  return Object.entries(compilerOptions.paths ?? {})
    .flatMap(([aliasPattern, targets]) => {
      const targetPattern = Array.isArray(targets) ? targets[0] : null;
      if (typeof targetPattern !== 'string') return [];
      const aliasExpression = new RegExp(
        `^${escapeRegExp(aliasPattern).replace('\\*', '(.+)')}$`,
      );
      const targetPrefix = targetPattern.split('*')[0];
      if (!isPathInside(rootDir, path.resolve(baseUrl, targetPrefix)))
        return [];
      return [{ aliasExpression, baseUrl, rootDir, targetPattern }];
    })
    .map((alias) => ({ ...alias, outputDir }));
}

function resolveInternalAlias(filePath, specifier, aliases) {
  for (const alias of aliases) {
    const match = specifier.match(alias.aliasExpression);
    if (!match) continue;
    const sourceTarget = path.resolve(
      alias.baseUrl,
      alias.targetPattern.replace('*', match[1] ?? ''),
    );
    if (!isPathInside(alias.rootDir, sourceTarget)) continue;
    const outputRelative = path
      .relative(alias.rootDir, sourceTarget)
      .replace(/(?:\.d)?\.[cm]?tsx?$/, '');
    const outputTarget = resolveOutputTarget(
      path.resolve(alias.outputDir, outputRelative),
    );
    if (!outputTarget) continue;
    let relativeTarget = path
      .relative(path.dirname(filePath), outputTarget)
      .split(path.sep)
      .join('/');
    if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
    return relativeTarget;
  }
  return specifier;
}

export function rewriteRelativeModuleSpecifiers(
  source,
  filePath,
  aliases = [],
) {
  return source.replace(MODULE_SPECIFIER, (match, prefix, quote, specifier) => {
    const resolved = specifier.startsWith('.')
      ? resolveRelativeSpecifier(filePath, specifier)
      : resolveInternalAlias(filePath, specifier, aliases);
    return resolved === specifier
      ? match
      : `${prefix}${quote}${resolved}${quote}`;
  });
}

export function fixEsmRelativeImports(outputDirs, { projectPath } = {}) {
  let changedFiles = 0;
  let checkedFiles = 0;

  for (const outputDir of outputDirs) {
    if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
      throw new Error(`Build output directory does not exist: ${outputDir}`);
    }
    const aliases = projectAliases(projectPath, outputDir);

    const stack = [outputDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }
        if (!entry.isFile() || !OUTPUT_FILE.test(entry.name)) continue;

        checkedFiles += 1;
        const source = fs.readFileSync(entryPath, 'utf8');
        const rewritten = rewriteRelativeModuleSpecifiers(
          source,
          entryPath,
          aliases,
        );
        if (rewritten === source) continue;
        fs.writeFileSync(entryPath, rewritten);
        changedFiles += 1;
      }
    }
  }

  return { changedFiles, checkedFiles };
}

function main() {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf('--project');
  const projectArg =
    projectIndex === -1 ? null : (args[projectIndex + 1] ?? null);
  if (projectIndex !== -1) args.splice(projectIndex, 2);
  const outputDirs = args.map((entry) => path.resolve(entry));
  if (outputDirs.length === 0) {
    throw new Error(
      'Usage: node scripts/fix-esm-relative-imports.mjs [--project tsconfig.json] <output-dir> [...]',
    );
  }
  const result = fixEsmRelativeImports(outputDirs, {
    projectPath: projectArg ? path.resolve(projectArg) : undefined,
  });
  console.log(
    `Fixed relative ESM imports in ${result.changedFiles}/${result.checkedFiles} build files.`,
  );
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectInvocation) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
