import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';

const DEFAULT_SOURCE_GLOBS = ['apps/server/api/src/**/*.controller.ts'];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/node_modules/**',
  '**/dist/**',
];

const HTTP_DECORATORS = new Map<string, string>([
  ['All', 'ALL'],
  ['Delete', 'DELETE'],
  ['Get', 'GET'],
  ['Head', 'HEAD'],
  ['Options', 'OPTIONS'],
  ['Patch', 'PATCH'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Sse', 'GET'],
]);

interface DecoratorCall {
  args: readonly ts.Expression[];
  name: string;
}

export interface EndpointRecord {
  auth: 'public' | 'guarded' | 'global-auth';
  bodyParams: string[];
  className: string;
  controllerPath: string;
  file: string;
  guards: string[];
  handlerName: string;
  line: number;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  requiresFixture: string[];
  routePath: string;
  smokeEligible: boolean;
}

export interface EndpointInventoryResult {
  endpoints: EndpointRecord[];
  generatedAt: string;
  rootDir: string;
  summary: {
    byAuth: Record<string, number>;
    byMethod: Record<string, number>;
    controllerFiles: number;
    endpoints: number;
    smokeEligible: number;
  };
}

export interface EndpointInventoryOptions {
  apiPrefix?: string;
  rootDir?: string;
  sourceGlobs?: string[];
}

interface CliOptions extends EndpointInventoryOptions {
  isJsonOutput: boolean;
  out?: string;
}

export function runEndpointInventory(
  options: EndpointInventoryOptions = {},
): EndpointInventoryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const apiPrefix = options.apiPrefix ?? '/v1';
  const files = findControllerFiles(rootDir, options.sourceGlobs);
  const endpoints = files.flatMap((file) => {
    return scanControllerFile(rootDir, file, apiPrefix);
  });

  endpoints.sort((left, right) => {
    return (
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method)
    );
  });

  return {
    endpoints,
    generatedAt: new Date().toISOString(),
    rootDir,
    summary: {
      byAuth: countBy(endpoints, (endpoint) => endpoint.auth),
      byMethod: countBy(endpoints, (endpoint) => endpoint.method),
      controllerFiles: files.length,
      endpoints: endpoints.length,
      smokeEligible: endpoints.filter((endpoint) => endpoint.smokeEligible)
        .length,
    },
  };
}

export function formatEndpointInventory(
  result: EndpointInventoryResult,
): string {
  const lines = [
    '# API Endpoint Inventory',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Controller files: ${result.summary.controllerFiles}`,
    `Endpoints: ${result.summary.endpoints}`,
    `Smoke-eligible GET endpoints: ${result.summary.smokeEligible}`,
    '',
    '## By Method',
    '',
    ...formatCountLines(result.summary.byMethod),
    '',
    '## By Auth Surface',
    '',
    ...formatCountLines(result.summary.byAuth),
    '',
    '## Endpoints',
    '',
    '| Method | Path | Auth | Guards | Handler | Fixture Needed |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const endpoint of result.endpoints) {
    lines.push(
      [
        endpoint.method,
        endpoint.path,
        endpoint.auth,
        endpoint.guards.join(', ') || '-',
        `${endpoint.className}.${endpoint.handlerName}`,
        endpoint.requiresFixture.join(', ') || '-',
      ]
        .map(escapeMarkdownCell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }

  lines.push('');
  return lines.join('\n');
}

function scanControllerFile(
  rootDir: string,
  absoluteFile: string,
  apiPrefix: string,
): EndpointRecord[] {
  const sourceText = readFileSync(absoluteFile, 'utf8');
  const source = ts.createSourceFile(
    absoluteFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const relativeFile = path.relative(rootDir, absoluteFile);
  const endpoints: EndpointRecord[] = [];

  function visit(node: ts.Node): void {
    if (!ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const classDecorators = getDecoratorCalls(node);
    const controllerDecorator = classDecorators.find((decorator) => {
      return decorator.name === 'Controller';
    });

    if (!controllerDecorator) {
      return;
    }

    const className = node.name?.text ?? '(anonymous)';
    const controllerPath = readRoutePath(controllerDecorator.args[0], source);
    const classGuards = readDecoratorArgumentTexts(
      classDecorators,
      'UseGuards',
    );
    const classIsPublic = hasDecorator(classDecorators, 'Public');

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }

      const methodDecorators = getDecoratorCalls(member);
      const routeDecorators = methodDecorators.filter((decorator) => {
        return HTTP_DECORATORS.has(decorator.name);
      });

      for (const routeDecorator of routeDecorators) {
        const methodGuards = readDecoratorArgumentTexts(
          methodDecorators,
          'UseGuards',
        );
        const guards = uniqueStrings([...classGuards, ...methodGuards]);
        const routePath = readRoutePath(routeDecorator.args[0], source);
        const isPublic =
          classIsPublic || hasDecorator(methodDecorators, 'Public');
        const auth = isPublic
          ? 'public'
          : guards.length > 0
            ? 'guarded'
            : 'global-auth';
        const pathParams = readParameterBindings(member, source, 'Param');
        const queryParams = readParameterBindings(member, source, 'Query');
        const bodyParams = readParameterBindings(member, source, 'Body');
        const method = HTTP_DECORATORS.get(routeDecorator.name) ?? 'UNKNOWN';
        const fullPath = joinRoutePath(apiPrefix, controllerPath, routePath);
        const requiresFixture = getFixtureRequirements(
          method,
          fullPath,
          bodyParams,
          queryParams,
        );

        endpoints.push({
          auth,
          bodyParams,
          className,
          controllerPath,
          file: relativeFile,
          guards,
          handlerName: member.name.getText(source),
          line:
            source.getLineAndCharacterOfPosition(member.name.getStart(source))
              .line + 1,
          method,
          path: fullPath,
          pathParams,
          queryParams,
          requiresFixture,
          routePath,
          smokeEligible: requiresFixture.length === 0 && method === 'GET',
        });
      }
    }
  }

  visit(source);
  return endpoints;
}

function findControllerFiles(
  rootDir: string,
  sourceGlobs?: string[],
): string[] {
  return (sourceGlobs ?? DEFAULT_SOURCE_GLOBS).flatMap((sourceGlob) => {
    return globSync(sourceGlob, {
      absolute: true,
      cwd: rootDir,
      ignore: DEFAULT_IGNORE_GLOBS,
      nodir: true,
    });
  });
}

function getDecoratorCalls(node: ts.Node): DecoratorCall[] {
  if (!ts.canHaveDecorators(node)) {
    return [];
  }

  return (ts.getDecorators(node) ?? [])
    .map((decorator): DecoratorCall | undefined => {
      const expression = decorator.expression;
      if (ts.isCallExpression(expression)) {
        return {
          args: expression.arguments,
          name: getExpressionName(expression.expression),
        };
      }

      return {
        args: [],
        name: getExpressionName(expression),
      };
    })
    .filter((decorator): decorator is DecoratorCall => {
      return Boolean(decorator?.name);
    });
}

function getExpressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return expression.getText();
}

function readRoutePath(
  expression: ts.Expression | undefined,
  source: ts.SourceFile,
): string {
  if (!expression) {
    return '';
  }

  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }

  return expression.getText(source);
}

function readDecoratorArgumentTexts(
  decorators: DecoratorCall[],
  name: string,
): string[] {
  return decorators
    .filter((decorator) => decorator.name === name)
    .flatMap((decorator) => {
      return decorator.args.map((arg) => arg.getText());
    });
}

function hasDecorator(decorators: DecoratorCall[], name: string): boolean {
  return decorators.some((decorator) => decorator.name === name);
}

function readParameterBindings(
  method: ts.MethodDeclaration,
  source: ts.SourceFile,
  decoratorName: string,
): string[] {
  return method.parameters.flatMap((parameter) => {
    const decorators = getDecoratorCalls(parameter).filter((decorator) => {
      return decorator.name === decoratorName;
    });

    return decorators.map((decorator) => {
      const firstArg = decorator.args[0];
      const binding = firstArg ? readRoutePath(firstArg, source) : '*';
      return `${binding}:${parameter.name.getText(source)}`;
    });
  });
}

function getFixtureRequirements(
  method: string,
  routePath: string,
  bodyParams: string[],
  queryParams: string[],
): string[] {
  const requirements: string[] = [];

  if (method !== 'GET') {
    requirements.push('non-idempotent method');
  }

  if (/\/:[^/]+/.test(routePath)) {
    requirements.push('path params');
  }

  if (bodyParams.length > 0) {
    requirements.push('body');
  }

  if (queryParams.some((query) => query.startsWith('*:'))) {
    requirements.push('query shape');
  }

  return uniqueStrings(requirements);
}

function joinRoutePath(...segments: string[]): string {
  const joined = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

  return `/${joined}`.replace(/\/+/g, '/');
}

function countBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = getKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function formatCountLines(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `- ${key}: ${count}`);
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { isJsonOutput: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.isJsonOutput = true;
    } else if (arg === '--out') {
      options.out = readRequiredArg(argv, index, arg);
      index += 1;
    } else if (arg === '--root') {
      options.rootDir = readRequiredArg(argv, index, arg);
      index += 1;
    } else if (arg === '--prefix') {
      options.apiPrefix = readRequiredArg(argv, index, arg);
      index += 1;
    }
  }

  return options;
}

function readRequiredArg(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function writeOutput(body: string, out?: string): void {
  if (!out) {
    process.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, body, 'utf8');
}

function isMainModule(): boolean {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

if (isMainModule()) {
  const options = parseArgs(process.argv.slice(2));
  const result = runEndpointInventory(options);
  const body = options.isJsonOutput
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatEndpointInventory(result);

  writeOutput(body, options.out);
}
