import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlobalModalKind } from '@genfeedai/props/modals/global-modals.props';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseSourceFile } from '../../../scripts/architecture/parse-source-file';
import { resolveModalCatalogScope } from '../i18n/AppGlobalModalIntlBoundary';

type Catalog = { [key: string]: Catalog | string };
interface Reference {
  file: string;
  name: string;
  client?: boolean;
}
interface TranslationUse {
  file: string;
  line: number;
  key: string;
  pages?: Catalog;
}
interface Translator {
  name: string;
  namespace: string;
  scope: ts.Node;
}
interface ModuleIndex {
  source: ts.SourceFile;
  client: boolean;
  imports: Map<string, Reference>;
  locals: Map<string, ts.Node>;
  exports: Map<string, Reference | ts.Node>;
  stars: string[];
  translators: Translator[];
}
interface Consumption {
  uses: Map<string, TranslationUse>;
  modals: boolean;
  modules: Set<string>;
}
interface ExportConsumption extends Consumption {
  dependencies: Set<string>;
}

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '../..');
const PROVIDER = path.join(APP, 'i18n/AppPageIntlProvider.tsx');
const MODAL_HOST = path.join(APP, 'i18n/AppGlobalModalIntlBoundary.tsx');
const MODALS = path.join(
  ROOT,
  'packages/contexts/providers/global-modals/GlobalModalsRenderer.tsx',
);
const OPTIONS = ts.parseJsonConfigFileContent(
  ts.readConfigFile(path.join(APP, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  APP,
).options;

function unwrap(node: ts.Node): ts.Node {
  return ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
    ? unwrap(node.expression)
    : node;
}
function isReference(value: Reference | ts.Node): value is Reference {
  return 'file' in value;
}
function ancestor(parent: ts.Node, child: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = child;
    current;
    current = current.parent
  )
    if (current === parent) return true;
  return false;
}
function delivered(catalog: Catalog, key: string): boolean {
  let value: Catalog | string | undefined = catalog;
  for (const segment of key.split('.').filter(Boolean))
    value = typeof value === 'object' ? value[segment] : undefined;
  return value !== undefined;
}
function deliveredTo(catalog: Catalog, use: TranslationUse): boolean {
  if (!use.pages || !use.key.startsWith('pages.'))
    return delivered(catalog, use.key);
  let inherited: Catalog | string | undefined = catalog.pages;
  let local: Catalog | string | undefined = use.pages;
  for (const segment of use.key.slice('pages.'.length).split('.')) {
    if (typeof local === 'string') return false;
    inherited = typeof inherited === 'object' ? inherited[segment] : undefined;
    local = local?.[segment];
  }
  return local !== undefined || inherited !== undefined;
}
function merge(left: Catalog, right: Catalog): Catalog {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const previous = result[key];
    result[key] =
      typeof previous === 'object' && typeof value === 'object'
        ? merge(previous, value)
        : value;
  }
  return result;
}

class NamespaceCoverage {
  private readonly cache = new Map<string, ModuleIndex>();
  private readonly consumptionCache = new Map<string, Consumption>();
  private readonly exportGraph = new Map<string, ExportConsumption>();
  private readonly catalogs = new Map<string, Catalog>();
  private readonly layoutCache = new Map<string, Catalog>();
  private readonly modalCatalogs = new Map<string, Catalog>();
  private readonly resolution = ts.createModuleResolutionCache(
    APP,
    (name) => name,
    OPTIONS,
  );

  resolve(specifier: string, file: string): string | undefined {
    return ts.resolveModuleName(
      specifier,
      file,
      OPTIONS,
      ts.sys,
      this.resolution,
    ).resolvedModule?.resolvedFileName;
  }

  index(file: string): ModuleIndex {
    const cached = this.cache.get(file);
    if (cached) return cached;
    const source = parseSourceFile(file, readFileSync(file, 'utf8'));
    const info: ModuleIndex = {
      source,
      client: source.statements.some(
        (node) =>
          ts.isExpressionStatement(node) &&
          ts.isStringLiteral(node.expression) &&
          node.expression.text === 'use client',
      ),
      imports: new Map(),
      locals: new Map(),
      exports: new Map(),
      stars: [],
      translators: [],
    };
    this.cache.set(file, info);
    for (const node of source.statements) {
      if (
        ts.isImportDeclaration(node) &&
        node.importClause &&
        !node.importClause.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const target = this.resolve(node.moduleSpecifier.text, file);
        if (!target) continue;
        const clause = node.importClause;
        if (clause.name)
          info.imports.set(clause.name.text, { file: target, name: 'default' });
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings))
            info.imports.set(clause.namedBindings.name.text, {
              file: target,
              name: '*',
            });
          else
            for (const item of clause.namedBindings.elements)
              if (!item.isTypeOnly)
                info.imports.set(item.name.text, {
                  file: target,
                  name: item.propertyName?.text ?? item.name.text,
                });
        }
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
        const target =
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
            ? this.resolve(node.moduleSpecifier.text, file)
            : undefined;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const item of node.exportClause.elements)
            if (!item.isTypeOnly) {
              const name = item.propertyName?.text ?? item.name.text;
              info.exports.set(
                item.name.text,
                target
                  ? { file: target, name }
                  : (item.propertyName ?? item.name),
              );
            }
        } else if (target) info.stars.push(target);
      } else if (ts.isExportAssignment(node))
        info.exports.set('default', node.expression);
      else if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isVariableStatement(node)
      ) {
        const names = ts.isVariableStatement(node)
          ? node.declarationList.declarations
              .filter((item) => ts.isIdentifier(item.name))
              .map((item) => [item.name.getText(source), item] as const)
          : node.name
            ? [[node.name.text, node] as const]
            : [];
        for (const [name, declaration] of names)
          info.locals.set(name, declaration);
        const modifiers = ts.canHaveModifiers(node)
          ? ts.getModifiers(node)
          : undefined;
        if (
          modifiers?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword)
        )
          info.exports.set('default', node);
        else if (
          modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)
        )
          for (const [name, declaration] of names)
            info.exports.set(name, declaration);
      }
    }
    const translators = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'useTranslations'
      ) {
        const argument = node.initializer.arguments[0];
        const namespace = !argument
          ? ''
          : ts.isStringLiteralLike(argument)
            ? argument.text
            : '<dynamic namespace>';
        info.translators.push({
          name: node.name.text,
          namespace,
          scope: node.parent.parent.parent,
        });
      }
      ts.forEachChild(node, translators);
    };
    translators(source);
    return info;
  }

  evaluate(
    file: string,
    expression: ts.Node,
    variant?: string,
    seen = new Set<ts.Node>(),
  ): Catalog | string | undefined {
    const node = unwrap(expression);
    if (seen.has(node)) return undefined;
    const nextSeen = new Set(seen).add(node);
    const info = this.index(file);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node)) {
      if (node.text === 'orgRootApp') return variant;
      const imported = info.imports.get(node.text);
      if (imported) {
        if (imported.file.endsWith('.json')) {
          let catalog = this.catalogs.get(imported.file);
          if (!catalog) {
            catalog = JSON.parse(
              readFileSync(imported.file, 'utf8'),
            ) as Catalog;
            this.catalogs.set(imported.file, catalog);
          }
          return catalog;
        }
        const exported = this.index(imported.file).exports.get(imported.name);
        return exported && !isReference(exported)
          ? this.evaluate(imported.file, exported, variant, nextSeen)
          : undefined;
      }
      for (
        let scope: ts.Node | undefined = node.parent;
        scope;
        scope = scope.parent
      ) {
        if (!ts.isBlock(scope)) continue;
        for (const statement of scope.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          const local = statement.declarationList.declarations.find(
            (declaration) =>
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === node.text,
          );
          if (local) return this.evaluate(file, local, variant, nextSeen);
        }
      }
      const local = info.locals.get(node.text);
      return local ? this.evaluate(file, local, variant, nextSeen) : undefined;
    }
    if (ts.isVariableDeclaration(node) && node.initializer)
      return this.evaluate(file, node.initializer, variant, nextSeen);
    if (ts.isPropertyAccessExpression(node)) {
      const parent = this.evaluate(file, node.expression, variant, nextSeen);
      return typeof parent === 'object' ? parent[node.name.text] : undefined;
    }
    if (ts.isElementAccessExpression(node)) {
      const parent = this.evaluate(file, node.expression, variant, nextSeen);
      const key =
        node.argumentExpression &&
        this.evaluate(file, node.argumentExpression, variant, nextSeen);
      return typeof parent === 'object' && typeof key === 'string'
        ? parent[key]
        : undefined;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const result: Catalog = {};
      for (const item of node.properties) {
        if (ts.isSpreadAssignment(item)) {
          const value = this.evaluate(file, item.expression, variant, nextSeen);
          if (typeof value === 'object') Object.assign(result, value);
        } else if (
          ts.isShorthandPropertyAssignment(item) ||
          ts.isPropertyAssignment(item)
        ) {
          const key =
            item.name &&
            (ts.isIdentifier(item.name) || ts.isStringLiteralLike(item.name))
              ? item.name.text
              : undefined;
          const value = this.evaluate(
            file,
            ts.isShorthandPropertyAssignment(item)
              ? item.name
              : item.initializer,
            variant,
            nextSeen,
          );
          if (key && value !== undefined) result[key] = value;
        }
      }
      return result;
    }
    return undefined;
  }

  layoutPages(file: string, variant?: string): Catalog {
    const key = `${file}:${variant ?? ''}`;
    const cached = this.layoutCache.get(key);
    if (cached) return cached;
    const info = this.index(file);
    let pages: Catalog = {};
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        info.imports.get(node.tagName.text)?.file === PROVIDER
      ) {
        const attribute = node.attributes.properties.find(
          (item) =>
            ts.isJsxAttribute(item) &&
            item.name.getText(info.source) === 'pages',
        );
        if (
          attribute &&
          ts.isJsxAttribute(attribute) &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        ) {
          const value = this.evaluate(
            file,
            attribute.initializer.expression,
            variant,
          );
          if (typeof value !== 'object')
            throw new Error(
              `Unresolved page delivery in ${path.relative(ROOT, file)}`,
            );
          pages = merge(pages, value);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(info.source);
    const target = info.exports.get('default');
    if (
      target &&
      isReference(target) &&
      target.file.startsWith(path.join(APP, 'app'))
    )
      pages = merge(pages, this.layoutPages(target.file, variant));
    this.layoutCache.set(key, pages);
    return pages;
  }

  modalCatalog(kind: GlobalModalKind, route: string): Catalog {
    const scope = resolveModalCatalogScope(kind, route);
    if (!scope) return {};
    const cached = this.modalCatalogs.get(scope);
    if (cached) return cached;
    const host = path.join(APP, 'i18n/AppGlobalModalIntlBoundary.tsx');
    const registry = this.index(host).locals.get('CATALOGS');
    if (
      !registry ||
      !ts.isVariableDeclaration(registry) ||
      !registry.initializer
    )
      throw new Error('Missing host modal registry');
    const object = unwrap(registry.initializer);
    if (!ts.isObjectLiteralExpression(object))
      throw new Error('Unsupported host modal registry');
    const property = object.properties.find(
      (node) =>
        ts.isPropertyAssignment(node) &&
        node.name.getText().replace(/^['"]|['"]$/g, '') === scope,
    );
    let target: string | undefined;
    const inspect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        target = this.resolve(node.arguments[0].text, host);
      ts.forEachChild(node, inspect);
    };
    if (property) inspect(property);
    if (!target) throw new Error(`Unresolved modal catalog ${scope}`);
    const exported = this.index(target).exports.get('default');
    const value =
      exported && !isReference(exported)
        ? this.evaluate(target, exported)
        : undefined;
    if (typeof value !== 'object')
      throw new Error(`Unresolved modal catalog value ${scope}`);
    this.modalCatalogs.set(scope, value);
    return value;
  }

  modalEntries(): Array<{ kind: GlobalModalKind; reference: Reference }> {
    const info = this.index(MODALS);
    const entries: Array<{ kind: GlobalModalKind; reference: Reference }> = [];
    const inspect = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'renderModal'
      ) {
        const [kind, child] = node.arguments;
        if (
          !kind ||
          !ts.isStringLiteralLike(kind) ||
          !child ||
          !(ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
        )
          throw new Error('Unsupported modal render boundary');
        const element = ts.isJsxElement(child) ? child.openingElement : child;
        const reference = info.imports.get(element.tagName.getText());
        if (!reference) throw new Error(`Unresolved modal entry ${kind.text}`);
        entries.push({
          kind: kind.text as GlobalModalKind,
          reference: { ...reference, client: true },
        });
      }
      ts.forEachChild(node, inspect);
    };
    inspect(info.source);
    return entries;
  }

  consume(entries: Array<string | Reference>, variant?: string): Consumption {
    if (entries.length > 1) {
      const combined: Consumption = {
        uses: new Map(),
        modals: false,
        modules: new Set(),
      };
      for (const entry of entries) {
        const item = this.consume([entry], variant);
        for (const [key, use] of item.uses) combined.uses.set(key, use);
        for (const file of item.modules) combined.modules.add(file);
        combined.modals ||= item.modals;
      }
      return combined;
    }
    const file = typeof entries[0] === 'string' ? entries[0] : entries[0]?.file;
    const selectedVariant = file?.includes('/[orgRootApp]/')
      ? variant
      : undefined;
    const cacheKey = JSON.stringify([entries, selectedVariant]);
    const cached = this.consumptionCache.get(cacheKey);
    if (cached) return cached;
    variant = selectedVariant;
    const result: Consumption = {
      uses: new Map(),
      modals: false,
      modules: new Set(),
    };
    let localPages: Catalog | undefined;
    let localScope = '';
    const roots = new Set<string>();
    let current: ExportConsumption | undefined;
    let visitedNodes = new Set<string>();
    const record = (file: string, node: ts.Node, key: string) => {
      const line =
        this.index(file).source.getLineAndCharacterOfPosition(node.getStart())
          .line + 1;
      if (!current) throw new Error('Translation outside selected export');
      current.uses.set(`${file}:${line}:${key}:${localScope}`, {
        file,
        line,
        key,
        pages: localPages,
      });
    };
    const walk = (
      file: string,
      name: string,
      inheritedClient: boolean,
    ): void => {
      if (
        file.includes('/node_modules/') ||
        file.endsWith('.d.ts') ||
        !/\.[jt]sx?$/.test(file)
      )
        return;
      // The host wrapper's load callback receives registry data at runtime.
      // modalCatalog evaluates that exact registry and modalEntries checks its
      // selected children separately, rather than walking every lazy catalog.
      if (file === MODAL_HOST && name === 'renderAppGlobalModal') {
        if (this.index(file).translators.length)
          throw new Error(
            'The modal host needs explicit translation-consumer coverage',
          );
        return;
      }
      if (file === MODALS) {
        if (!current) throw new Error('Modal outside selected export');
        current.modals = true;
        return;
      }
      const info = this.index(file);
      const client = inheritedClient || info.client;
      const key = JSON.stringify([file, name, client, localScope, variant]);
      if (current) current.dependencies.add(key);
      else roots.add(key);
      if (this.exportGraph.has(key)) return;
      const exported: ExportConsumption = {
        uses: new Map(),
        modules: new Set([file]),
        modals: false,
        dependencies: new Set(),
      };
      this.exportGraph.set(key, exported);
      const previous = current;
      const previousNodes = visitedNodes;
      current = exported;
      visitedNodes = new Set();
      if (name === '*') {
        for (const symbol of info.exports.keys()) walk(file, symbol, client);
        for (const star of info.stars) walk(star, '*', client);
      } else {
        const target = info.exports.get(name);
        if (target) {
          if (isReference(target)) walk(target.file, target.name, client);
          else visit(file, target, client);
        } else for (const star of info.stars) walk(star, name, client);
      }
      current = previous;
      visitedNodes = previousNodes;
    };
    const decision = (
      file: string,
      expression: ts.Expression,
    ): boolean | undefined => {
      if (!variant || !file.includes('/[orgRootApp]/')) return undefined;
      const node = unwrap(expression);
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(node.operatorToken.kind)
      ) {
        const left = this.evaluate(file, node.left, variant);
        const right = this.evaluate(file, node.right, variant);
        if (typeof left === 'string' && typeof right === 'string')
          return node.operatorToken.kind ===
            ts.SyntaxKind.EqualsEqualsEqualsToken
            ? left === right
            : left !== right;
      }
      return undefined;
    };
    const statements = (
      file: string,
      nodes: ts.NodeArray<ts.Statement>,
      client: boolean,
    ): boolean => {
      for (const node of nodes) {
        if (ts.isIfStatement(node)) {
          const known = decision(file, node.expression);
          if (known !== false) visit(file, node.thenStatement, client);
          if (known !== true && node.elseStatement)
            visit(file, node.elseStatement, client);
          if (
            known === true &&
            (ts.isReturnStatement(node.thenStatement) ||
              (ts.isBlock(node.thenStatement) && ends(node.thenStatement)))
          )
            return true;
          continue;
        }
        visit(file, node, client);
        if (ts.isReturnStatement(node)) return true;
      }
      return false;
    };
    const ends = (block: ts.Block): boolean => {
      const last = block.statements.at(-1);
      return (
        !!last &&
        (ts.isReturnStatement(last) ||
          (ts.isExpressionStatement(last) &&
            ts.isCallExpression(last.expression) &&
            ts.isIdentifier(last.expression.expression) &&
            ['notFound', 'redirect'].includes(last.expression.expression.text)))
      );
    };
    const visit = (file: string, node: ts.Node, client: boolean): void => {
      const info = this.index(file);
      const key = `${file}:${node.pos}:${node.end}:${client}:${localScope}`;
      if (visitedNodes.has(key)) return;
      visitedNodes.add(key);
      if (
        ts.isTypeNode(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)
      )
        return;
      if (
        ts.isJsxElement(node) &&
        ts.isIdentifier(node.openingElement.tagName) &&
        info.imports.get(node.openingElement.tagName.text)?.file === PROVIDER
      ) {
        const attribute = node.openingElement.attributes.properties.find(
          (item) => ts.isJsxAttribute(item) && item.name.getText() === 'pages',
        );
        const value =
          attribute &&
          ts.isJsxAttribute(attribute) &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
            ? this.evaluate(file, attribute.initializer.expression, variant)
            : undefined;
        if (typeof value !== 'object')
          throw new Error(
            `Unresolved rendered provider in ${path.relative(ROOT, file)}`,
          );
        const previousPages = localPages;
        const previousScope = localScope;
        localPages = merge(localPages ?? {}, value);
        localScope = `${localScope}/${file}:${node.pos}`;
        for (const child of node.children) visit(file, child, client);
        localPages = previousPages;
        localScope = previousScope;
        return;
      }
      if (ts.isBlock(node)) {
        statements(file, node.statements, client);
        return;
      }
      if (client && ts.isCallExpression(node)) {
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'useTranslations'
        ) {
          const argument = node.arguments[0];
          record(
            file,
            node,
            !argument
              ? ''
              : ts.isStringLiteralLike(argument)
                ? argument.text
                : '<dynamic namespace>',
          );
        }
        const callee = ts.isIdentifier(node.expression)
          ? node.expression
          : ts.isPropertyAccessExpression(node.expression) &&
              ts.isIdentifier(node.expression.expression)
            ? node.expression.expression
            : undefined;
        if (callee) {
          const translator = info.translators
            .filter(
              (item) => item.name === callee.text && ancestor(item.scope, node),
            )
            .at(-1);
          if (
            translator &&
            !(
              ts.isPropertyAccessExpression(node.expression) &&
              node.expression.name.text === 'has'
            )
          ) {
            const argument = node.arguments[0];
            const keys =
              argument && ts.isConditionalExpression(argument)
                ? [argument.whenTrue, argument.whenFalse]
                : argument
                  ? [argument]
                  : [];
            for (const expression of keys) {
              let optional = false;
              for (
                let scope: ts.Node | undefined = node.parent;
                scope && ancestor(translator.scope, scope);
                scope = scope.parent
              ) {
                if (
                  !ts.isConditionalExpression(scope) ||
                  !ancestor(scope.whenTrue, node)
                )
                  continue;
                const condition = unwrap(scope.condition);
                if (
                  ts.isCallExpression(condition) &&
                  ts.isPropertyAccessExpression(condition.expression) &&
                  ts.isIdentifier(condition.expression.expression) &&
                  condition.expression.expression.text === translator.name &&
                  condition.expression.name.text === 'has' &&
                  condition.arguments[0]?.getText() === expression.getText()
                )
                  optional = true;
              }
              if (optional) continue;
              const suffix = ts.isStringLiteralLike(expression)
                ? expression.text
                : ts.isTemplateExpression(expression)
                  ? expression.head.text.replace(/\.$/, '')
                  : undefined;
              if (suffix)
                record(
                  file,
                  node,
                  [translator.namespace, suffix].filter(Boolean).join('.'),
                );
            }
          }
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) {
          const target = this.resolve(argument.text, file);
          const names = new Set<string>();
          const parent = node.parent;
          if (
            ts.isPropertyAccessExpression(parent) &&
            parent.name.text === 'then' &&
            ts.isCallExpression(parent.parent)
          ) {
            const callback = parent.parent.arguments[0];
            if (
              callback &&
              (ts.isArrowFunction(callback) ||
                ts.isFunctionExpression(callback)) &&
              callback.parameters[0] &&
              ts.isIdentifier(callback.parameters[0].name)
            ) {
              const parameter = callback.parameters[0].name.text;
              const selected = (child: ts.Node) => {
                if (
                  ts.isPropertyAccessExpression(child) &&
                  ts.isIdentifier(child.expression) &&
                  child.expression.text === parameter
                )
                  names.add(child.name.text);
                ts.forEachChild(child, selected);
              };
              selected(callback.body);
            }
            if (
              callback &&
              (ts.isArrowFunction(callback) ||
                ts.isFunctionExpression(callback)) &&
              callback.parameters[0] &&
              ts.isObjectBindingPattern(callback.parameters[0].name)
            ) {
              for (const binding of callback.parameters[0].name.elements) {
                if (binding.dotDotDotToken) continue;
                const name = binding.propertyName ?? binding.name;
                if (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
                  names.add(name.text);
              }
            }
            if (!names.size && target && !target.includes('/node_modules/'))
              throw new Error(
                `Unsupported lazy selection in ${path.relative(ROOT, file)}:${info.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
              );
          } else names.add('default');
          if (target) for (const name of names) walk(target, name, client);
        }
        return;
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const imported = info.imports.get(node.expression.text);
        if (imported?.name === '*') {
          walk(imported.file, node.name.text, client);
          return;
        }
      }
      if (ts.isIdentifier(node)) {
        if (
          (ts.isPropertyAccessExpression(node.parent) &&
            node.parent.name === node) ||
          (ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        )
          return;
        const imported = info.imports.get(node.text);
        if (imported) walk(imported.file, imported.name, client);
        else {
          const local = info.locals.get(node.text);
          if (local && local !== node) visit(file, local, client);
        }
      }
      ts.forEachChild(node, (child) => visit(file, child, client));
    };
    for (const entry of entries)
      walk(
        typeof entry === 'string' ? entry : entry.file,
        typeof entry === 'string' ? 'default' : entry.name,
        typeof entry === 'string' ? false : (entry.client ?? false),
      );
    const reached = new Set<string>();
    const collect = (key: string) => {
      if (reached.has(key)) return;
      reached.add(key);
      const exported = this.exportGraph.get(key);
      if (!exported) throw new Error(`Missing selected export ${key}`);
      for (const [id, use] of exported.uses) result.uses.set(id, use);
      for (const file of exported.modules) result.modules.add(file);
      result.modals ||= exported.modals;
      for (const dependency of exported.dependencies) collect(dependency);
    };
    for (const root of roots) collect(root);
    this.consumptionCache.set(cacheKey, result);
    return result;
  }
}

function routePages(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (
      entry.startsWith('.') ||
      ['node_modules', 'coverage', 'dist'].includes(entry)
    )
      return [];
    const file = path.join(directory, entry);
    return statSync(file).isDirectory()
      ? routePages(file)
      : entry === 'page.tsx' || entry === 'page.ts'
        ? [file]
        : [];
  });
}
function ancestors(page: string): string[] {
  const layouts: string[] = [];
  for (
    let directory = path.dirname(page);
    directory.startsWith(path.join(APP, 'app'));
    directory = path.dirname(directory)
  ) {
    const file = path.join(directory, 'layout.tsx');
    if (existsSync(file)) layouts.unshift(file);
  }
  return layouts;
}

function withSourceFixture(
  files: Record<string, string>,
  run: (directory: string) => void,
) {
  const directory = mkdtempSync(path.join(tmpdir(), 'genfeed-intl-coverage-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(directory, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const USED_WIDGET =
  "import { useTranslations } from 'next-intl'; export function Used() { const t = useTranslations('pages.library'); return <span>{t('emptyOpenPlayground')}</span>; }";
const UNUSED_WIDGET =
  "import { useTranslations } from 'next-intl'; export function Unused() { const t = useTranslations('pages.adminFlags'); return <span>{t('title')}</span>; }";

describe('namespace coverage negative controls', () => {
  it('detects a cross-area widget missing from its actual ancestor provider', () => {
    withSourceFixture(
      {
        'page.tsx':
          "'use client'; import { Used } from './used'; export default function Page() { return <Used />; }",
        'used.tsx': USED_WIDGET,
        'layout.tsx': `import Provider from '${PROVIDER}'; const messages = { workflows: { title: 'Workflows' } }; export default function Layout({ children }) { return <Provider pages={messages}>{children}</Provider>; }`,
      },
      (directory) => {
        const guard = new NamespaceCoverage();
        const catalog = {
          pages: guard.layoutPages(path.join(directory, 'layout.tsx')),
        };
        const uses = guard.consume([path.join(directory, 'page.tsx')]).uses;
        expect(
          [...uses.values()]
            .filter((use) => !deliveredTo(catalog, use))
            .map((use) => use.key),
        ).toContain('pages.library');
      },
    );
  });

  it('follows only the selected export of a barrel', () => {
    withSourceFixture(
      {
        'page.tsx':
          "'use client'; import { Used } from './barrel'; export default function Page() { return <Used />; }",
        'barrel.ts':
          "export { Used } from './used'; export { Unused } from './unused';",
        'used.tsx': USED_WIDGET,
        'unused.tsx': UNUSED_WIDGET,
      },
      (directory) => {
        const uses = [
          ...new NamespaceCoverage()
            .consume([path.join(directory, 'page.tsx')])
            .uses.values(),
        ].map((use) => use.key);
        expect(uses).toContain('pages.library.emptyOpenPlayground');
        expect(uses.some((key) => key.startsWith('pages.adminFlags'))).toBe(
          false,
        );
      },
    );
  });

  it('retains every requirement when cached selected exports form a cycle', () => {
    withSourceFixture(
      {
        'first.tsx':
          "'use client'; import { Second } from './second'; import { useTranslations } from 'next-intl'; export function First() { const t = useTranslations('pages.library'); return <>{t('emptyOpenPlayground')}<Second /></>; }",
        'second.tsx':
          "import { First } from './first'; import { Unused } from './unused'; export function Second() { return <><First /><Unused /></>; }",
        'unused.tsx': UNUSED_WIDGET,
      },
      (directory) => {
        const guard = new NamespaceCoverage();
        const first = guard.consume([
          {
            file: path.join(directory, 'first.tsx'),
            name: 'First',
            client: true,
          },
        ]);
        const second = guard.consume([
          {
            file: path.join(directory, 'second.tsx'),
            name: 'Second',
            client: true,
          },
        ]);
        for (const consumption of [first, second]) {
          const keys = [...consumption.uses.values()].map((use) => use.key);
          expect(keys).toContain('pages.library.emptyOpenPlayground');
          expect(keys).toContain('pages.adminFlags.title');
        }
      },
    );
  });

  it.each([
    '(mod) => mod.Used',
    '(mod) => ({ default: mod.Used })',
    '({ Used }) => Used',
    '(mod) => { return mod.Used; }',
  ])(
    'follows a selected lazy export without an unrelated widget: %s',
    (selector) => {
      withSourceFixture(
        {
          'page.tsx': `'use client'; import { lazy } from 'react'; const Used = lazy(() => import('./barrel').then(${selector})); const Unused = lazy(() => import('./unused')); export default function Page() { return <Used />; }`,
          'barrel.ts':
            "export { Used } from './used'; export { Unused } from './unused';",
          'used.tsx': USED_WIDGET,
          'unused.tsx': UNUSED_WIDGET,
        },
        (directory) => {
          const uses = [
            ...new NamespaceCoverage()
              .consume([path.join(directory, 'page.tsx')])
              .uses.values(),
          ].map((use) => use.key);
          expect(uses).toContain('pages.library.emptyOpenPlayground');
          expect(uses.some((key) => key.startsWith('pages.adminFlags'))).toBe(
            false,
          );
        },
      );
    },
  );

  it('fails explicitly on an unresolved dynamic namespace', () => {
    withSourceFixture(
      {
        'page.tsx':
          "'use client'; import { useTranslations } from 'next-intl'; export default function Page() { const t = useTranslations(getRuntimeNamespace()); return <span>{t('title')}</span>; }",
      },
      (directory) => {
        const uses = [
          ...new NamespaceCoverage()
            .consume([path.join(directory, 'page.tsx')])
            .uses.values(),
        ];
        expect(uses.some((use) => use.key === '<dynamic namespace>')).toBe(
          true,
        );
        expect(uses.every((use) => !delivered({}, use.key))).toBe(true);
      },
    );
  });

  it('allows only the actual has-guarded optional fallback while rejecting an unguarded missing key', () => {
    withSourceFixture(
      {
        'page.tsx':
          "'use client'; import { useTranslations } from 'next-intl'; export default function Page() { const t = useTranslations('pages.library'); return <>{t.has?.('optional') ? t('optional') : 'fallback'}{t('required')}</>; }",
      },
      (directory) => {
        const uses = [
          ...new NamespaceCoverage()
            .consume([path.join(directory, 'page.tsx')])
            .uses.values(),
        ];
        const missing = uses
          .filter((use) => !deliveredTo({ pages: { library: {} } }, use))
          .map((use) => use.key);
        expect(missing).toEqual(['pages.library.required']);
      },
    );
  });

  it('keeps a local page provider scoped to its rendered children', () => {
    withSourceFixture(
      {
        'page.tsx': `import Provider from '${PROVIDER}'; import { Used } from './used'; const messages = { library: { emptyOpenPlayground: 'Open' } }; export default function Page() { return <><Provider pages={messages}><Used /></Provider><Used /></>; }`,
        'used.tsx': `'use client'; ${USED_WIDGET}`,
      },
      (directory) => {
        const uses = [
          ...new NamespaceCoverage()
            .consume([path.join(directory, 'page.tsx')])
            .uses.values(),
        ].filter((use) => use.key === 'pages.library.emptyOpenPlayground');
        expect(uses).toHaveLength(2);
        expect(uses.filter((use) => deliveredTo({}, use))).toHaveLength(1);
      },
    );
  });

  it('detects removal of the actual host-owned brand catalog', () => {
    const guard = new NamespaceCoverage();
    const entry = guard.modalEntries().find((item) => item.kind === 'brand');
    if (!entry) throw new Error('Missing brand modal boundary');
    const uses = [...guard.consume([entry.reference]).uses.values()];
    const library = uses.find((use) =>
      use.key.startsWith('pages.brandDetailOverview'),
    );
    if (!library)
      throw new Error(
        'Brand coverage did not reach its detail translation consumer',
      );
    expect(delivered({ pages: {} }, library.key)).toBe(false);
    const catalog = {
      pages: guard.modalCatalog('brand', '/acme/brand/publishing/posts'),
    };
    expect(delivered(catalog, library.key)).toBe(true);
  });
});

// Every route is checked against the providers it really inherits. Lazy modal
// rendering is a separate host boundary rather than an unbounded barrel walk.
describe('all current route namespace delivery', () => {
  it('delivers each reachable client translation namespace from its ancestor providers', () => {
    const coverage = new NamespaceCoverage();
    const shared: Catalog = {};
    for (const key of ['agent', 'common', 'ui'])
      shared[key] = JSON.parse(
        readFileSync(path.join(APP, `messages/en/${key}.json`), 'utf8'),
      ) as Catalog;
    const violations: string[] = [];
    const uses = new Set<string>();
    const modules = new Set<string>();
    const checkedModals = new Set<string>();
    const routeCatalogs = new Map<string, Catalog>();
    const modalEntries = coverage.modalEntries();
    expect(new Set(modalEntries.map((entry) => entry.kind)).size).toBe(14);
    let routes = 0;
    for (const page of routePages(path.join(APP, 'app'))) {
      const layouts = ancestors(page);
      const variants = page.includes('/[orgRootApp]/')
        ? ['automation', 'library', 'studio', 'messages', 'publishing']
        : [undefined];
      for (const variant of variants) {
        routes += 1;
        const catalogKey = JSON.stringify([layouts, variant]);
        let catalog = routeCatalogs.get(catalogKey);
        if (!catalog) {
          catalog = shared;
          for (const layout of layouts)
            catalog = merge(catalog, {
              pages: coverage.layoutPages(layout, variant),
            });
          routeCatalogs.set(catalogKey, catalog);
        }
        const consumption = coverage.consume([...layouts, page], variant);
        for (const module of consumption.modules) modules.add(module);
        if (consumption.modals) {
          const route = path
            .relative(path.join(APP, 'app'), page)
            .replace(/\/page\.tsx?$/, '')
            .replace(/(?:^|\/)\([^/]+\)/g, '')
            .replace('[orgRootApp]', variant ?? '[orgRootApp]');
          const pathname = `/${route}`;
          const inherited = merge(shared, {
            pages: coverage.layoutPages(
              path.join(APP, 'app/(protected)/layout.tsx'),
            ),
          });
          const confirm = merge(inherited, {
            pages: coverage.modalCatalog('confirm', pathname),
          });
          for (const use of consumption.uses.values())
            if (use.key.startsWith('pages.') && !deliveredTo(confirm, use))
              violations.push(
                `confirmation on ${route} -> ${path.relative(ROOT, use.file)}:${use.line} ${use.key}`,
              );
          for (const entry of modalEntries) {
            const catalog = merge(inherited, {
              pages: coverage.modalCatalog(entry.kind, pathname),
            });
            const key = `${entry.kind}:${resolveModalCatalogScope(entry.kind, pathname) ?? ''}`;
            if (checkedModals.has(key)) continue;
            checkedModals.add(key);
            const modal = coverage.consume([entry.reference]);
            for (const [id, use] of modal.uses) {
              uses.add(id);
              if (!deliveredTo(catalog, use))
                violations.push(
                  `${entry.kind} modal -> ${path.relative(ROOT, use.file)}:${use.line} ${use.key}`,
                );
            }
          }
        }
        for (const [key, use] of consumption.uses) {
          uses.add(key);
          if (!deliveredTo(catalog, use))
            violations.push(
              `${path.relative(APP, page)}${variant ? ` [${variant}]` : ''} -> ${path.relative(ROOT, use.file)}:${use.line} ${use.key}`,
            );
        }
      }
    }
    expect({ routes, useSites: uses.size }).toMatchObject({
      routes: expect.any(Number),
      useSites: expect.any(Number),
    });
    expect(routes).toBeGreaterThan(100);
    expect(uses.size).toBeGreaterThan(100);
    process.stdout.write(
      `Intl route coverage: ${JSON.stringify({ routes, useSites: uses.size, modules: modules.size, modalContexts: checkedModals.size, violations: violations.length })}\n`,
    );
    if (process.env.GENFEED_INTL_COVERAGE_REPORT)
      writeFileSync(
        process.env.GENFEED_INTL_COVERAGE_REPORT,
        JSON.stringify(violations),
      );
    expect(
      violations.sort().slice(0, 60),
      `${violations.length} undelivered translation uses`,
    ).toEqual([]);
  }, 60_000);
});
