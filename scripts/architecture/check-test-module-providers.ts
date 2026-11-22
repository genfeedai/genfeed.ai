import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * A hand-built Nest test module must provide everything its classes inject.
 *
 * The API's integration and E2E harnesses list real services by hand
 * (`E2ETestModule.forRoot({ providers: [PostGroupsService] })`). When a
 * production constructor gains a dependency, the harness that lists the class
 * stops resolving, and `Test.createTestingModule(...).compile()` throws
 * "Nest can't resolve dependencies of ...". Those suites run only on the
 * nightly and dispatch-only E2E workflow, so the PR that adds the dependency
 * merges green and master goes red. It happened in #9986 (TaskReviewAccessService),
 * #10248 (the visual-code fixture) and #10853 (PostGroupIdempotencyService).
 *
 * This guard reads the same constructors Nest reads, on every PR, without a
 * database. A definition it cannot evaluate completely (an import it cannot
 * open, a dynamic provider list) is reported as skipped, never as clean.
 */

const repositoryRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

const NEST_BUILT_IN_TOKENS = new Set([
  'ApplicationConfig',
  'HttpAdapterHost',
  'ModuleRef',
  'Reflector',
]);

export type TestModuleProviderViolation = {
  file: string;
  line: number;
  definition: string;
  missing: string;
  neededBy: string;
  parameter: string;
};

export type SkippedDefinition = {
  file: string;
  line: number;
  reason: string;
};

export type TestModuleProviderResult = {
  checked: number;
  skipped: SkippedDefinition[];
  violations: TestModuleProviderViolation[];
};

export type TestModuleProviderOptions = {
  /** Directory reported paths are relative to. */
  rootDir?: string;
  /** Files holding the hand-built modules, absolute paths. */
  harnessFiles: string[];
  /** The tsconfig whose `paths` resolve the harness imports. */
  tsconfigPath: string;
};

type Provided = {
  /** Class a provider instantiates, when it is a class. */
  instantiates?: ts.ClassDeclaration;
  /** Tokens a factory provider injects. */
  injects: string[];
  token: string;
};

type Definition = {
  controllers: ts.ClassDeclaration[];
  open: string | null;
  providers: Provided[];
  /** Providers whose token cannot be read; any of them might supply a gap. */
  unreadable: number;
  /** Queue-token providers whose queue names it cannot read. */
  unreadableQueues: number;
};

const FACTORY_METHOD_PATTERN = /^for[A-Z]/;

const OPEN_PROVIDER = Symbol('open');
const UNREADABLE_PROVIDER = Symbol('unreadable');
/** A list built from `getQueueToken(...)` whose queue names are not literal. */
const UNREADABLE_QUEUES = Symbol('unreadable-queues');

/** `names.map((name) => ({ provide: getQueueToken(name), ... }))`. */
type StandIn = { queue: boolean; standInOf: ts.Expression };

type ListElement =
  | ts.Expression
  | StandIn
  | typeof OPEN_PROVIDER
  | typeof UNREADABLE_PROVIDER
  | typeof UNREADABLE_QUEUES;

class ModuleEvaluator {
  constructor(private readonly checker: ts.TypeChecker) {}

  symbolOf(node: ts.Node): ts.Symbol | undefined {
    let symbol =
      node.parent &&
      ts.isShorthandPropertyAssignment(node.parent) &&
      node.parent.name === node
        ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
        : this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    return symbol;
  }

  tokenKey(node: ts.Node): string | null {
    if (ts.isStringLiteralLike(node)) return `"${node.text}"`;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'getQueueToken' &&
      node.arguments[0]
    ) {
      const queue = this.tokenKey(node.arguments[0]);
      return queue ? `queue:${queue}` : null;
    }
    const symbol = this.symbolOf(node);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!symbol || !declaration) return null;
    return `${declaration.getSourceFile().fileName}#${symbol.name}`;
  }

  classOf(node: ts.Node): ts.ClassDeclaration | undefined {
    const declaration = this.symbolOf(node)?.declarations?.find(
      ts.isClassDeclaration,
    );
    return declaration;
  }

  tokenLabel(key: string): string {
    return key.slice(key.lastIndexOf('#') + 1);
  }

  /** A class provider is its own token; an object provider names its token. */
  private provider(element: ts.Expression): Provided | typeof OPEN_PROVIDER {
    if (ts.isObjectLiteralExpression(element)) {
      const props = new Map<string, ts.Expression>();
      for (const property of element.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          props.set(property.name.text, property.initializer);
        }
      }
      const provide = props.get('provide');
      const token = provide ? this.tokenKey(provide) : null;
      if (!token) return OPEN_PROVIDER;
      const injects: string[] = [];
      const inject = props.get('inject');
      if (inject && ts.isArrayLiteralExpression(inject)) {
        for (const item of inject.elements) {
          const key = this.tokenKey(item);
          if (key) injects.push(key);
        }
      }
      const useClass = props.get('useClass');
      return {
        injects,
        instantiates: useClass ? this.classOf(useClass) : undefined,
        token,
      };
    }
    const token = this.tokenKey(element);
    if (!token) return OPEN_PROVIDER;
    return { injects: [], instantiates: this.classOf(element), token };
  }

  /**
   * Evaluates a provider or controller list. `substitutions` supplies the
   * properties a `forX(options)` caller passes in, so the evaluation sees the
   * list a call site really builds.
   */
  list(
    expression: ts.Expression | undefined,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
    seen = new Set<ts.Node>(),
  ): ListElement[] {
    if (!expression) return [];
    if (seen.has(expression)) return [];
    seen.add(expression);
    const node = unwrap(expression);

    if (ts.isArrayLiteralExpression(node)) {
      const out: ListElement[] = [];
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          out.push(...this.list(element.expression, substitutions, seen));
        } else {
          out.push(element);
        }
      }
      return out;
    }
    if (ts.isConditionalExpression(node)) {
      return [
        ...this.list(node.whenTrue, substitutions, seen),
        ...this.list(node.whenFalse, substitutions, seen),
      ];
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return [
        ...this.list(node.left, substitutions, seen),
        ...this.list(node.right, substitutions, seen),
      ];
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['filter', 'map', 'slice'].includes(node.expression.name.text)
    ) {
      // A callback that builds a fresh provider object changes the tokens, so
      // the receiver's elements say nothing about what the result provides.
      const callback = node.arguments[0];
      if (callback && callbackBuildsObjects(callback)) {
        const standIn = standInShape(callback);
        if (!standIn) {
          return [
            providesQueuesOnly(callback)
              ? UNREADABLE_QUEUES
              : UNREADABLE_PROVIDER,
          ];
        }
        return this.list(node.expression.expression, substitutions, seen).map(
          (element): ListElement =>
            element === OPEN_PROVIDER ||
            element === UNREADABLE_PROVIDER ||
            element === UNREADABLE_QUEUES
              ? element
              : 'standInOf' in element
                ? UNREADABLE_PROVIDER
                : { queue: standIn.queue, standInOf: element },
        );
      }
      return this.list(node.expression.expression, substitutions, seen);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const key = substitutionKey(node, node.expression.text, node.name.text);
      if (substitutions.has(key)) {
        return this.list(substitutions.get(key), substitutions, seen);
      }
      return [OPEN_PROVIDER];
    }
    if (ts.isIdentifier(node)) {
      const declaration = this.symbolOf(node)?.declarations?.[0];
      if (declaration && ts.isBindingElement(declaration)) {
        const property = (
          declaration.propertyName ?? declaration.name
        ).getText();
        const owner = declaration.parent.parent;
        if (
          ts.isVariableDeclaration(owner) &&
          owner.initializer &&
          ts.isIdentifier(owner.initializer)
        ) {
          const key = substitutionKey(owner, owner.initializer.text, property);
          if (substitutions.has(key)) {
            return this.list(substitutions.get(key), substitutions, seen);
          }
        }
        return [OPEN_PROVIDER];
      }
      if (declaration && ts.isVariableDeclaration(declaration)) {
        return declaration.initializer
          ? this.list(declaration.initializer, substitutions, seen)
          : [OPEN_PROVIDER];
      }
    }
    return [OPEN_PROVIDER];
  }

  /** Constructor dependencies Nest resolves for `declaration`. */
  dependencies(
    declaration: ts.ClassDeclaration,
    seen = new Set<ts.ClassDeclaration>(),
  ): Array<{ parameter: string; token: string }> {
    if (seen.has(declaration)) return [];
    seen.add(declaration);
    const constructorDeclaration = declaration.members.find(
      (member): member is ts.ConstructorDeclaration =>
        ts.isConstructorDeclaration(member) && member.body !== undefined,
    );
    if (!constructorDeclaration) {
      const base = declaration.heritageClauses?.find(
        (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
      )?.types[0]?.expression;
      const baseClass = base ? this.classOf(base) : undefined;
      return baseClass ? this.dependencies(baseClass, seen) : [];
    }
    const out: Array<{ parameter: string; token: string }> = [];
    for (const parameter of constructorDeclaration.parameters) {
      const decorators = (ts.getDecorators(parameter) ?? []).map((decorator) =>
        decoratorParts(decorator),
      );
      if (decorators.some((decorator) => decorator.name === 'Optional')) {
        continue;
      }
      const inject = decorators.find(
        (decorator) => decorator.name === 'Inject',
      );
      let token: string | null = null;
      if (inject) {
        const argument = inject.argument
          ? forwardRefTarget(inject.argument)
          : null;
        token = argument ? this.tokenKey(argument) : null;
      } else if (
        decorators.some((decorator) => decorator.name === 'InjectQueue')
      ) {
        const queue = decorators.find(
          (decorator) => decorator.name === 'InjectQueue',
        );
        const queueKey = queue?.argument ? this.tokenKey(queue.argument) : null;
        token = queueKey ? `queue:${queueKey}` : null;
      } else if (decorators.length === 0) {
        const type = parameter.type;
        if (
          type &&
          ts.isTypeReferenceNode(type) &&
          ts.isIdentifier(type.typeName)
        ) {
          const target = this.classOf(type.typeName);
          token = target ? this.tokenKey(type.typeName) : null;
        }
      }
      if (token) out.push({ parameter: parameter.name.getText(), token });
    }
    return out;
  }

  /** Evaluates the module a definition node builds, or why it cannot. */
  definition(
    controllers: ts.Expression | undefined,
    providers: ts.Expression | undefined,
    imports: ts.Expression | undefined,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
  ): Definition {
    const result: Definition = {
      controllers: [],
      open: null,
      providers: [],
      unreadable: 0,
      unreadableQueues: 0,
    };
    for (const element of this.list(imports, substitutions)) {
      const resolved =
        element === OPEN_PROVIDER ||
        element === UNREADABLE_PROVIDER ||
        element === UNREADABLE_QUEUES ||
        'standInOf' in element
          ? undefined
          : this.dynamicModuleOf(element);
      if (resolved) {
        result.controllers.push(...resolved.controllers);
        result.providers.push(...resolved.providers);
        result.unreadable += resolved.unreadable;
        result.unreadableQueues += resolved.unreadableQueues;
        result.open ??= resolved.open;
      } else {
        result.open ??= 'an imported module it cannot open';
      }
    }
    for (const element of this.list(controllers, substitutions)) {
      const target =
        element === OPEN_PROVIDER ||
        element === UNREADABLE_PROVIDER ||
        element === UNREADABLE_QUEUES ||
        'standInOf' in element
          ? undefined
          : this.classOf(element);
      if (target) result.controllers.push(target);
      else result.open ??= 'a controller list it cannot evaluate';
    }
    for (const element of this.list(providers, substitutions)) {
      if (element === UNREADABLE_PROVIDER) {
        result.unreadable += 1;
        continue;
      }
      if (element === UNREADABLE_QUEUES) {
        result.unreadableQueues += 1;
        continue;
      }
      if (element !== OPEN_PROVIDER && 'standInOf' in element) {
        const key = this.tokenKey(element.standInOf);
        if (key) {
          result.providers.push({
            injects: [],
            token: element.queue ? `queue:${key}` : key,
          });
        } else {
          result.unreadable += 1;
        }
        continue;
      }
      const evaluated =
        element === OPEN_PROVIDER ? OPEN_PROVIDER : this.provider(element);
      if (evaluated === OPEN_PROVIDER) {
        if (element === OPEN_PROVIDER) {
          result.open ??= 'a provider list it cannot evaluate';
        } else {
          result.unreadable += 1;
        }
      } else {
        result.providers.push(evaluated);
      }
    }
    return result;
  }

  /** `const moduleConfig = await E2ETestModule.forRoot({...})`. */
  private dynamicModuleOf(expression: ts.Expression): Definition | undefined {
    const node = unwrap(expression);
    if (ts.isCallExpression(node)) return this.factoryCall(node);
    if (!ts.isIdentifier(node)) return undefined;
    const declaration = this.symbolOf(node)?.declarations?.[0];
    if (!declaration || !ts.isVariableDeclaration(declaration))
      return undefined;
    const initializer = declaration.initializer
      ? unwrap(declaration.initializer)
      : undefined;
    return initializer ? this.factoryCall(initializer) : undefined;
  }

  /**
   * `E2ETestModule.forRoot(options)` and the `forX` helpers built on it. The
   * call's argument fills the `options.*` reads inside the method; a helper
   * that forwards to `forRoot` passes its own substitutions down.
   */
  factoryCall(
    call: ts.Expression,
    outer: ReadonlyMap<string, ts.Expression | undefined> = new Map(),
  ): Definition | undefined {
    if (!ts.isCallExpression(call)) return undefined;
    if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
    const method = this.methodOf(call.expression);
    if (!method?.body) return undefined;
    const argument = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
    const substitutions = new Map(outer);
    const parameter = method.parameters[0];
    if (parameter && ts.isIdentifier(parameter.name)) {
      for (const name of ['controllers', 'providers', 'imports']) {
        substitutions.set(
          substitutionKey(method, parameter.name.text, name),
          argument && ts.isObjectLiteralExpression(argument)
            ? propertyValue(argument, name)
            : undefined,
        );
      }
    }
    const returned = returnedExpression(method.body);
    const target = returned ? unwrap(returned) : undefined;
    if (!target) return undefined;
    if (ts.isObjectLiteralExpression(target)) {
      return this.definition(
        propertyValue(target, 'controllers'),
        propertyValue(target, 'providers'),
        propertyValue(target, 'imports'),
        substitutions,
      );
    }
    return this.factoryCall(target, substitutions);
  }

  private methodOf(
    access: ts.PropertyAccessExpression,
  ): ts.MethodDeclaration | undefined {
    const owner = this.classOf(access.expression);
    if (!owner) return undefined;
    return owner.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) &&
        member.name.getText() === access.name.text &&
        (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) !== 0,
    );
  }
}

function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function callbackBuildsObjects(callback: ts.Expression): boolean {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return false;
  }
  const body = callback.body;
  const produced = ts.isBlock(body) ? returnedExpression(body) : body;
  return (
    produced !== undefined && ts.isObjectLiteralExpression(unwrap(produced))
  );
}

function providesQueuesOnly(callback: ts.Expression): boolean {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return false;
  }
  const body = callback.body;
  const produced = ts.isBlock(body) ? returnedExpression(body) : body;
  const literal = produced ? unwrap(produced) : undefined;
  const provide =
    literal && ts.isObjectLiteralExpression(literal)
      ? propertyValue(literal, 'provide')
      : undefined;
  return (
    provide !== undefined &&
    ts.isCallExpression(provide) &&
    provide.expression.getText() === 'getQueueToken'
  );
}

function standInShape(callback: ts.Expression): { queue: boolean } | null {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return null;
  }
  const parameter = callback.parameters[0];
  if (!parameter || !ts.isIdentifier(parameter.name)) return null;
  const body = callback.body;
  const produced = ts.isBlock(body) ? returnedExpression(body) : body;
  const literal = produced ? unwrap(produced) : undefined;
  if (!literal || !ts.isObjectLiteralExpression(literal)) return null;
  const provide = propertyValue(literal, 'provide');
  if (!provide) return null;
  if (ts.isIdentifier(provide) && provide.text === parameter.name.text) {
    return { queue: false };
  }
  if (
    ts.isCallExpression(provide) &&
    provide.expression.getText() === 'getQueueToken' &&
    provide.arguments[0]?.getText() === parameter.name.text
  ) {
    return { queue: true };
  }
  return null;
}

/** A `options.providers` read belongs to the method whose parameter it is. */
function substitutionKey(
  inside: ts.Node,
  parameter: string,
  property: string,
): string {
  let current: ts.Node | undefined = inside;
  while (current && !ts.isMethodDeclaration(current)) current = current.parent;
  return `${current?.pos ?? -1}:${parameter}.${property}`;
}

function propertyValue(
  literal: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of literal.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) {
      return property.initializer;
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === name
    ) {
      return property.name;
    }
  }
  return undefined;
}

function decoratorParts(decorator: ts.Decorator): {
  argument?: ts.Expression;
  name: string;
} {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    return {
      argument: expression.arguments[0],
      name: expression.expression.getText(),
    };
  }
  return { name: expression.getText() };
}

function forwardRefTarget(argument: ts.Expression): ts.Expression | null {
  const node = unwrap(argument);
  if (
    ts.isCallExpression(node) &&
    node.expression.getText() === 'forwardRef' &&
    node.arguments[0] &&
    ts.isArrowFunction(node.arguments[0]) &&
    !ts.isBlock(node.arguments[0].body)
  ) {
    return node.arguments[0].body;
  }
  return node;
}

function returnedExpression(body: ts.Block): ts.Expression | undefined {
  for (const statement of body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression) {
      return statement.expression;
    }
  }
  return undefined;
}

function enclosingClassName(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current)) return current.name?.text;
    current = current.parent;
  }
  return undefined;
}

export function findTestModuleProviderViolations(
  options: TestModuleProviderOptions,
): TestModuleProviderResult {
  const config = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(options.tsconfigPath),
  );
  const program = ts.createProgram({
    options: {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    rootNames: options.harnessFiles,
  });
  const checker = program.getTypeChecker();
  const evaluator = new ModuleEvaluator(checker);

  const result: TestModuleProviderResult = {
    checked: 0,
    skipped: [],
    violations: [],
  };

  const inspect = (
    sourceFile: ts.SourceFile,
    node: ts.Node,
    label: string,
    definition: Definition | undefined,
  ): void => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const file = path.relative(
      options.rootDir ?? repositoryRoot,
      sourceFile.fileName,
    );
    if (!definition || definition.open) {
      result.skipped.push({
        file,
        line,
        reason: definition?.open ?? `${label} is not a shape this guard reads`,
      });
      return;
    }
    result.checked += 1;

    const provided = new Map<string, Provided>();
    // Nest keeps the last provider registered for a token, so a stand-in listed
    // after a real class replaces it and the class is never instantiated.
    for (const entry of definition.providers) provided.set(entry.token, entry);

    const owners: Array<{
      declaration: ts.ClassDeclaration;
      injects: string[];
    }> = [
      ...definition.controllers.map((declaration) => ({
        declaration,
        injects: [] as string[],
      })),
      ...[...provided.values()].flatMap((entry) =>
        entry.instantiates
          ? [{ declaration: entry.instantiates, injects: entry.injects }]
          : [],
      ),
    ];

    // A `Test.createTestingModule({ imports: [moduleConfig] })` repeats the gap
    // of the factory call it imports; report each gap once per file.
    const reported = new Set<string>(
      result.violations
        .filter((violation) => violation.file === file)
        .map((violation) => `${violation.neededBy}:${violation.missing}`),
    );
    const violationsBefore = result.violations.length;
    for (const owner of owners) {
      if (owner.declaration.getSourceFile().fileName.includes('node_modules')) {
        continue;
      }
      const ownerName = owner.declaration.name?.text ?? '(anonymous class)';
      for (const dependency of evaluator.dependencies(owner.declaration)) {
        if (provided.has(dependency.token)) continue;
        if (
          definition.unreadableQueues > 0 &&
          dependency.token.startsWith('queue:')
        ) {
          continue;
        }
        if (NEST_BUILT_IN_TOKENS.has(evaluator.tokenLabel(dependency.token))) {
          continue;
        }
        const key = `${ownerName}:${evaluator.tokenLabel(dependency.token)}`;
        if (reported.has(key)) continue;
        reported.add(key);
        result.violations.push({
          definition: label,
          file,
          line,
          missing: evaluator.tokenLabel(dependency.token),
          neededBy: ownerName,
          parameter: dependency.parameter,
        });
      }
      for (const token of owner.injects) {
        if (provided.has(token)) continue;
        const key = `the factory provider for ${ownerName}:${evaluator.tokenLabel(token)}`;
        if (reported.has(key)) continue;
        reported.add(key);
        result.violations.push({
          definition: label,
          file,
          line,
          missing: evaluator.tokenLabel(token),
          neededBy: `the factory provider for ${ownerName}`,
          parameter: 'inject',
        });
      }
    }
    if (
      definition.unreadable > 0 &&
      result.violations.length > violationsBefore
    ) {
      result.violations.length = violationsBefore;
      result.checked -= 1;
      result.skipped.push({
        file,
        line,
        reason: 'a provider whose token it cannot read might supply the gap',
      });
    }
  };

  const harnessSet = new Set(
    options.harnessFiles.map((file) => path.resolve(file)),
  );
  for (const sourceFile of program.getSourceFiles()) {
    if (!harnessSet.has(path.resolve(sourceFile.fileName))) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'createTestingModule' &&
          callee.expression.getText() === 'Test'
        ) {
          const argument = node.arguments[0]
            ? unwrap(node.arguments[0])
            : undefined;
          if (argument && ts.isObjectLiteralExpression(argument)) {
            inspect(
              sourceFile,
              node,
              'Test.createTestingModule',
              evaluator.definition(
                propertyValue(argument, 'controllers'),
                propertyValue(argument, 'providers'),
                propertyValue(argument, 'imports'),
                new Map(),
              ),
            );
          }
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          FACTORY_METHOD_PATTERN.test(callee.name.text) &&
          enclosingClassName(node) !==
            evaluator.classOf(callee.expression)?.name?.text
        ) {
          const owner = evaluator.classOf(callee.expression);
          if (owner?.name?.text === 'E2ETestModule') {
            inspect(
              sourceFile,
              node,
              callee.getText(),
              evaluator.factoryCall(node),
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return result;
}

export async function runTestModuleProviderCheck(
  root: string,
): Promise<TestModuleProviderResult> {
  const { globSync } = await import('glob');
  const apiRoot = path.join(root, 'apps/server/api');
  const { API_E2E_TIER_MANIFEST } = await import(
    path.join(apiRoot, 'scripts/api-e2e-tiers.manifest.ts')
  );
  // A spec the tier manifest excludes never runs, and its harness is already
  // tracked as broken there, so it is not held to this guard.
  const excluded = new Set<string>(
    API_E2E_TIER_MANIFEST.exclusions.map((entry: { file: string }) =>
      path.join(apiRoot, entry.file),
    ),
  );
  // The root spec only inspects the provider list; it never compiles it.
  excluded.add(path.join(apiRoot, 'test/e2e-test.module.spec.ts'));
  const harnessFiles = globSync('test/**/*.ts', {
    absolute: true,
    cwd: apiRoot,
  }).filter((file) => !excluded.has(file));
  return findTestModuleProviderViolations({
    harnessFiles,
    rootDir: root,
    tsconfigPath: path.join(apiRoot, 'tsconfig.json'),
  });
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return (
    Boolean(entryPoint) &&
    path.resolve(entryPoint) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  const rootFlag = process.argv.indexOf('--root');
  const root =
    rootFlag === -1 ? repositoryRoot : path.resolve(process.argv[rootFlag + 1]);
  const result = await runTestModuleProviderCheck(root);
  for (const skipped of result.skipped) {
    console.warn(`skipped ${skipped.file}:${skipped.line} (${skipped.reason})`);
  }
  if (result.violations.length > 0) {
    console.error(
      'Test modules that do not provide what their classes inject:',
    );
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.definition}: ${violation.neededBy} injects ${violation.missing} (constructor parameter \`${violation.parameter}\`), which no provider supplies. Add ${violation.missing} to this module's providers, or provide a stand-in with { provide: ${violation.missing}, useValue: ... }.`,
      );
    }
    process.exit(1);
  }
  console.log(
    `Test module provider guard passed: ${result.checked} module definition(s) resolved, ${result.skipped.length} skipped.`,
  );
}
