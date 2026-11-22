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
  /** True when the list it came from has a branch or filter that may drop it. */
  conditional?: boolean;
  /** Class a provider instantiates, when it is a class. */
  instantiates?: ts.ClassDeclaration;
  /** Tokens a factory provider injects. */
  injects: string[];
  token: string;
};

type Definition = {
  controllers: ts.ClassDeclaration[];
  /** Tokens an importing module can inject; null when the module exports none. */
  exports: string[] | null;
  /** Modules this one imports. Each keeps its own providers private. */
  imported: Definition[];
  open: string | null;
  providers: Provided[];
  /** Providers whose token cannot be read; any of them might supply a gap. */
  unreadable: number;
  /** Queue-token providers whose queue names it cannot read. */
  unreadableQueues: number;
};

function emptyDefinition(open: string | null = null): Definition {
  return {
    controllers: [],
    exports: null,
    imported: [],
    open,
    providers: [],
    unreadable: 0,
    unreadableQueues: 0,
  };
}

/** An object property whose value a spread of something unreadable may replace. */
const UNKNOWN_EXPRESSION = ts.factory.createIdentifier('unknown');

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
  /** Factory methods being evaluated; one that reaches itself is unreadable. */
  private readonly active = new Set<ts.MethodDeclaration>();
  /** Provider expressions a branch, `??` or filter may leave out of the list. */
  private readonly conditional = new WeakSet<ts.Node>();
  /** The name a token went by where it was declared, for the error message. */
  private readonly labels = new Map<string, string>();

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
    // `const DEP = 'dep'` and the literal 'dep' are one Nest token.
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.parent.flags & ts.NodeFlags.Const &&
      declaration.initializer &&
      ts.isStringLiteralLike(unwrap(declaration.initializer))
    ) {
      const key = `"${(unwrap(declaration.initializer) as ts.StringLiteralLike).text}"`;
      if (!this.labels.has(key)) this.labels.set(key, symbol.name);
      return key;
    }
    return `${declaration.getSourceFile().fileName}#${symbol.name}`;
  }

  /** The Nest export a decorator is imported as, so `Inject as Token` still reads. */
  decoratorName(callee: ts.Expression): string {
    const identifier = ts.isPropertyAccessExpression(callee)
      ? callee.name
      : callee;
    if (!ts.isIdentifier(identifier)) return callee.getText();
    const specifier = this.checker
      .getSymbolAtLocation(identifier)
      ?.declarations?.find(ts.isImportSpecifier);
    return specifier
      ? (specifier.propertyName ?? specifier.name).text
      : identifier.text;
  }

  decoratorParts(decorator: ts.Decorator): {
    argument?: ts.Expression;
    name: string;
  } {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      return {
        argument: expression.arguments[0],
        name: this.decoratorName(expression.expression),
      };
    }
    return { name: this.decoratorName(expression) };
  }

  /** The object literal an expression is, or the one a `const` names. */
  objectLiteralOf(
    expression: ts.Expression,
    depth = 0,
  ): ts.ObjectLiteralExpression | undefined {
    const node = unwrap(expression);
    if (ts.isObjectLiteralExpression(node)) return node;
    if (!ts.isIdentifier(node) || depth > 8) return undefined;
    const declaration = this.symbolOf(node)?.declarations?.[0];
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.parent.flags & ts.NodeFlags.Const &&
      declaration.initializer
    ) {
      return this.objectLiteralOf(declaration.initializer, depth + 1);
    }
    return undefined;
  }

  /**
   * The last value an object literal gives `name`, in assignment order, with
   * spreads read where they can be. A spread that cannot be read may replace
   * the property, so the result is then `UNKNOWN_EXPRESSION`.
   */
  property(
    literal: ts.ObjectLiteralExpression,
    name: string,
    depth = 0,
  ): ts.Expression | undefined {
    let value: ts.Expression | undefined;
    for (const property of literal.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText() === name
      ) {
        value = property.initializer;
      } else if (
        ts.isShorthandPropertyAssignment(property) &&
        property.name.text === name
      ) {
        value = property.name;
      } else if (ts.isSpreadAssignment(property)) {
        const spread =
          depth < 8 ? this.objectLiteralOf(property.expression) : undefined;
        if (!spread) {
          value = UNKNOWN_EXPRESSION;
        } else {
          value = this.property(spread, name, depth + 1) ?? value;
        }
      }
    }
    return value;
  }

  classOf(node: ts.Node): ts.ClassDeclaration | undefined {
    const declaration = this.symbolOf(node)?.declarations?.find(
      ts.isClassDeclaration,
    );
    return declaration;
  }

  tokenLabel(key: string): string {
    if (key.startsWith('queue:')) return this.tokenLabel(key.slice(6));
    return this.labels.get(key) ?? key.slice(key.lastIndexOf('#') + 1);
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
          if (!key) return OPEN_PROVIDER;
          injects.push(key);
        }
      } else if (inject) {
        return OPEN_PROVIDER;
      }
      // An alias resolves its target the way a factory resolves its inject list.
      const useExisting = props.get('useExisting');
      if (useExisting) {
        const target = this.tokenKey(useExisting);
        if (!target) return OPEN_PROVIDER;
        injects.push(target);
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
   * list a call site really builds. A list it cannot follow is `OPEN_PROVIDER`.
   */
  list(
    expression: ts.Expression | undefined,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
    active = new Set<ts.Node>(),
  ): ListElement[] {
    if (!expression) return [];
    if (expression === UNKNOWN_EXPRESSION) return [OPEN_PROVIDER];
    // Only the expressions being expanded right now guard against a cycle; a
    // list spread twice must expand twice, in registration order.
    if (active.has(expression)) return [OPEN_PROVIDER];
    active.add(expression);
    try {
      return this.evaluateList(expression, substitutions, active);
    } finally {
      active.delete(expression);
    }
  }

  isConditional(element: ts.Expression): boolean {
    return this.conditional.has(element);
  }

  /** Marks what a branch that may not run contributes. */
  private maybe(elements: ListElement[]): ListElement[] {
    for (const element of elements) {
      if (typeof element !== 'symbol' && !('standInOf' in element)) {
        this.conditional.add(element);
      }
    }
    return elements;
  }

  /** What `options.providers` or `{ providers }` resolves to inside a `forX`. */
  private substitution(
    node: ts.Expression,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
  ): { found: boolean; value?: ts.Expression } {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const key = substitutionKey(node, node.expression.text, node.name.text);
      return substitutions.has(key)
        ? { found: true, value: substitutions.get(key) }
        : { found: false };
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
            return {
              found: true,
              value: substitutions.get(key) ?? declaration.initializer,
            };
          }
        }
      }
    }
    return { found: false };
  }

  /** Whether a `??` or `||` left side is a list, nothing, or not known. */
  private leftSide(
    left: ts.Expression,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
  ): 'list' | 'nothing' | 'unknown' {
    const node = unwrap(left);
    const substituted = this.substitution(node, substitutions);
    if (substituted.found) {
      if (!substituted.value) return 'nothing';
      return this.leftSide(substituted.value, new Map());
    }
    if (ts.isArrayLiteralExpression(node)) return 'list';
    if (
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) && node.text === 'undefined')
    ) {
      return 'nothing';
    }
    return 'unknown';
  }

  private evaluateList(
    expression: ts.Expression,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
    active: Set<ts.Node>,
  ): ListElement[] {
    const node = unwrap(expression);

    if (ts.isArrayLiteralExpression(node)) {
      const out: ListElement[] = [];
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          out.push(...this.list(element.expression, substitutions, active));
        } else {
          out.push(element);
        }
      }
      return out;
    }
    if (ts.isConditionalExpression(node)) {
      // Only a branch that runs contributes providers.
      const condition = unwrap(node.condition);
      if (condition.kind === ts.SyntaxKind.TrueKeyword) {
        return this.list(node.whenTrue, substitutions, active);
      }
      if (condition.kind === ts.SyntaxKind.FalseKeyword) {
        return this.list(node.whenFalse, substitutions, active);
      }
      return this.maybe([
        ...this.list(node.whenTrue, substitutions, active),
        ...this.list(node.whenFalse, substitutions, active),
      ]);
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      const left = this.leftSide(node.left, substitutions);
      if (left === 'list') return this.list(node.left, substitutions, active);
      if (left === 'nothing') {
        return this.list(node.right, substitutions, active);
      }
      return this.maybe([
        ...this.list(node.left, substitutions, active),
        ...this.list(node.right, substitutions, active),
      ]);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text;
      const receiver = (): ListElement[] =>
        this.list(node.expression.expression, substitutions, active);
      // `slice` and `filter` may drop any element of the receiver.
      if (method === 'slice' || method === 'filter') {
        return this.maybe(receiver());
      }
      const callback = node.arguments[0];
      if (method !== 'map' || !callback) return [OPEN_PROVIDER];
      // A map that returns each provider as it is, or a copy that only changes
      // how it is built, keeps the receiver's tokens.
      if (keepsProviderTokens(callback)) return receiver();
      if (!callbackBuildsObjects(callback)) return [OPEN_PROVIDER];
      const standIn = standInShape(callback);
      if (!standIn) {
        return [
          providesQueuesOnly(callback)
            ? UNREADABLE_QUEUES
            : UNREADABLE_PROVIDER,
        ];
      }
      return this.list(node.expression.expression, substitutions, active).map(
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
    const substituted = this.substitution(node, substitutions);
    if (substituted.found) {
      return this.list(substituted.value, substitutions, active);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      return [OPEN_PROVIDER];
    }
    if (ts.isIdentifier(node)) {
      const declaration = this.symbolOf(node)?.declarations?.[0];
      if (declaration && ts.isBindingElement(declaration)) {
        return [OPEN_PROVIDER];
      }
      if (declaration && ts.isVariableDeclaration(declaration)) {
        return declaration.initializer
          ? this.list(declaration.initializer, substitutions, active)
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
        this.decoratorParts(decorator),
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

  /** Evaluates the module a definition literal builds, or why it cannot. */
  definition(
    literal: ts.ObjectLiteralExpression,
    substitutions: ReadonlyMap<string, ts.Expression | undefined>,
  ): Definition {
    const result = emptyDefinition();
    const exported = this.property(literal, 'exports');
    if (exported) {
      result.exports = [];
      for (const element of this.list(exported, substitutions)) {
        const token =
          element === OPEN_PROVIDER ||
          element === UNREADABLE_PROVIDER ||
          element === UNREADABLE_QUEUES ||
          'standInOf' in element
            ? null
            : this.tokenKey(element);
        if (token) result.exports.push(token);
        else result.open ??= 'an exports list it cannot read';
      }
    }
    for (const element of this.list(
      this.property(literal, 'imports'),
      substitutions,
    )) {
      const resolved =
        element === OPEN_PROVIDER ||
        element === UNREADABLE_PROVIDER ||
        element === UNREADABLE_QUEUES ||
        'standInOf' in element
          ? undefined
          : this.dynamicModuleOf(element);
      if (resolved) {
        result.imported.push(resolved);
        result.open ??= resolved.open;
      } else {
        result.open ??= 'an imported module it cannot open';
      }
    }
    for (const element of this.list(
      this.property(literal, 'controllers'),
      substitutions,
    )) {
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
    for (const element of this.list(
      this.property(literal, 'providers'),
      substitutions,
    )) {
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
        if (element !== OPEN_PROVIDER && this.isConditional(element)) {
          evaluated.conditional = true;
        }
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
    if (this.active.has(method)) {
      return emptyDefinition('a factory method that calls itself');
    }
    const supplied = call.arguments[0];
    const argument = supplied ? this.objectLiteralOf(supplied) : undefined;
    if (supplied && !argument) {
      return emptyDefinition('an options argument it cannot read');
    }
    const substitutions = new Map(outer);
    const parameter = method.parameters[0];
    if (parameter && ts.isIdentifier(parameter.name)) {
      for (const name of ['controllers', 'providers', 'imports']) {
        substitutions.set(
          substitutionKey(method, parameter.name.text, name),
          argument ? this.property(argument, name) : undefined,
        );
      }
    }
    const returned = returnedExpression(method.body);
    const target = returned ? unwrap(returned) : undefined;
    if (!target) return undefined;
    this.active.add(method);
    try {
      if (ts.isObjectLiteralExpression(target)) {
        return this.definition(target, substitutions);
      }
      return this.factoryCall(target, substitutions);
    } finally {
      this.active.delete(method);
    }
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

/**
 * `(provider) => provider` and `(provider) => ({ ...provider, useFactory })`
 * give back the provider they were handed, only built differently. A callback
 * that returns anything else may change tokens.
 */
function keepsProviderTokens(callback: ts.Expression): boolean {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
    return false;
  }
  const parameter = callback.parameters[0];
  if (!parameter || !ts.isIdentifier(parameter.name)) return false;
  const name = parameter.name.text;
  const returns: ts.Expression[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node !== callback) return;
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(node.expression);
    }
    ts.forEachChild(node, collect);
  };
  if (ts.isBlock(callback.body)) collect(callback.body);
  else returns.push(callback.body);
  if (returns.length === 0) return false;
  const rebuilds = new Set(['inject', 'provide', 'useClass', 'useExisting']);
  return returns.every((returned) => {
    const node = unwrap(returned);
    if (ts.isIdentifier(node)) return node.text === name;
    if (!ts.isObjectLiteralExpression(node)) return false;
    const [first, ...rest] = node.properties;
    return (
      first !== undefined &&
      ts.isSpreadAssignment(first) &&
      ts.isIdentifier(first.expression) &&
      first.expression.text === name &&
      rest.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          !rebuilds.has(property.name.getText()),
      )
    );
  });
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

type Owner = {
  declaration?: ts.ClassDeclaration;
  injects: string[];
  name: string;
};

function unitsOf(definition: Definition): Definition[] {
  return [definition, ...definition.imported.flatMap(unitsOf)];
}

/**
 * What a module can inject: its own providers, and whatever the modules it
 * imports export. Nest keeps the last registration of a token, so a stand-in
 * listed after a real class replaces it and the class is never instantiated.
 */
function providedBy(unit: Definition): Map<string, Provided> {
  const provided = new Map<string, Provided>();
  for (const child of unit.imported) {
    for (const token of child.exports ?? []) {
      provided.set(token, { injects: [], token });
    }
  }
  for (const entry of unit.providers) provided.set(entry.token, entry);
  return provided;
}

function ownersOf(
  unit: Definition,
  provided: ReadonlyMap<string, Provided>,
  evaluator: ModuleEvaluator,
): Owner[] {
  const owners: Owner[] = unit.controllers.map((declaration) => ({
    declaration,
    injects: [],
    name: declaration.name?.text ?? '(anonymous class)',
  }));
  for (const entry of unit.providers) {
    // A stand-in registered later replaced this entry.
    if (provided.get(entry.token) !== entry) continue;
    if (!entry.instantiates && entry.injects.length === 0) continue;
    owners.push({
      declaration: entry.instantiates,
      injects: entry.injects,
      name: entry.instantiates?.name?.text ?? evaluator.tokenLabel(entry.token),
    });
  }
  return owners.filter(
    (owner) =>
      !owner.declaration?.getSourceFile().fileName.includes('node_modules'),
  );
}

/** `Test.createTestingModule(...).useMocker(...)` fills any gap at compile. */
function usesMocker(call: ts.CallExpression): boolean {
  let current: ts.Node = call;
  while (
    current.parent &&
    ts.isPropertyAccessExpression(current.parent) &&
    current.parent.expression === current &&
    current.parent.parent &&
    ts.isCallExpression(current.parent.parent)
  ) {
    if (current.parent.name.text === 'useMocker') return true;
    current = current.parent.parent;
  }
  return false;
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

    // A `Test.createTestingModule({ imports: [moduleConfig] })` repeats the gap
    // of the factory call it imports; report each gap once per file.
    const reported = new Set<string>(
      result.violations
        .filter((violation) => violation.file === file)
        .map((violation) => `${violation.neededBy}:${violation.missing}`),
    );
    let partial: string | null = null;
    let inconclusive = false;
    for (const unit of unitsOf(definition)) {
      const provided = providedBy(unit);
      const found: Array<{
        key: string;
        violation: TestModuleProviderViolation;
      }> = [];
      let gaps = 0;
      const note = (
        key: string,
        missing: string,
        neededBy: string,
        parameter: string,
      ): void => {
        gaps += 1;
        if (reported.has(key)) return;
        reported.add(key);
        found.push({
          key,
          violation: {
            definition: label,
            file,
            line,
            missing,
            neededBy,
            parameter,
          },
        });
      };

      for (const owner of ownersOf(unit, provided, evaluator)) {
        for (const dependency of owner.declaration
          ? evaluator.dependencies(owner.declaration)
          : []) {
          if (provided.has(dependency.token)) {
            if (provided.get(dependency.token)?.conditional) {
              partial ??= 'a provider that a branch or filter may leave out';
            }
            continue;
          }
          if (
            unit.unreadableQueues > 0 &&
            dependency.token.startsWith('queue:')
          ) {
            partial ??=
              'a queue provider whose name it cannot read might supply a queue';
            continue;
          }
          if (
            NEST_BUILT_IN_TOKENS.has(evaluator.tokenLabel(dependency.token))
          ) {
            continue;
          }
          const missing = evaluator.tokenLabel(dependency.token);
          note(
            `${owner.name}:${missing}`,
            missing,
            owner.name,
            dependency.parameter,
          );
        }
        for (const token of owner.injects) {
          if (provided.has(token)) {
            if (provided.get(token)?.conditional) {
              partial ??= 'a provider that a branch or filter may leave out';
            }
            continue;
          }
          const missing = evaluator.tokenLabel(token);
          note(
            `the provider for ${owner.name}:${missing}`,
            missing,
            `the provider for ${owner.name}`,
            'inject',
          );
        }
      }

      // A provider whose token it cannot read might supply any gap found here,
      // however an earlier definition's report deduplicated it.
      if (unit.unreadable > 0 && gaps > 0) {
        inconclusive = true;
        for (const entry of found) reported.delete(entry.key);
        continue;
      }
      for (const entry of found) result.violations.push(entry.violation);
    }
    if (inconclusive) {
      result.checked -= 1;
      result.skipped.push({
        file,
        line,
        reason: 'a provider whose token it cannot read might supply the gap',
      });
    } else if (partial) {
      result.checked -= 1;
      result.skipped.push({ file, line, reason: partial });
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
          const literal = argument
            ? evaluator.objectLiteralOf(argument)
            : undefined;
          if (literal) {
            inspect(
              sourceFile,
              node,
              'Test.createTestingModule',
              usesMocker(node)
                ? emptyDefinition(
                    'a useMocker callback may supply what the module lacks',
                  )
                : evaluator.definition(literal, new Map()),
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
