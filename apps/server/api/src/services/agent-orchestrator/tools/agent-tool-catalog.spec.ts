import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentToolName } from '@genfeedai/interfaces';
import {
  CURATED_ACTION_CATALOG,
  getToolsForSurface,
  isActionOnSurface,
} from '@genfeedai/tools';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXECUTOR_PATH = resolve(HERE, 'agent-tool-executor.service.ts');

function collectExecutorCaseMembers(sourceText: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    EXECUTOR_PATH,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const members = new Set<string>();

  const collectCases = (node: ts.Node): void => {
    if (
      ts.isCaseClause(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'AgentToolName'
    ) {
      members.add(node.expression.name.text);
    }
    ts.forEachChild(node, collectCases);
  };

  const findDispatch = (node: ts.Node): void => {
    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dispatch' &&
      node.body
    ) {
      collectCases(node.body);
      return;
    }
    ts.forEachChild(node, findDispatch);
  };

  findDispatch(sourceFile);
  return members;
}

describe('curated Agent action catalog', () => {
  it('lists exactly the actions reviewed for Agent', () => {
    const expected = CURATED_ACTION_CATALOG.filter((entry) =>
      isActionOnSurface(entry, 'agent'),
    ).map((entry) => entry.name);
    const actual = getToolsForSurface('agent').map((tool) => tool.name);

    expect(actual).toEqual(expected);
  });

  it('maps every Agent action to a declared AgentToolName', () => {
    const enumValues = new Set<string>(Object.values(AgentToolName));
    const missing = getToolsForSurface('agent')
      .map((tool) => tool.name)
      .filter((name) => !enumValues.has(name));

    expect(missing).toEqual([]);
  });

  it('maps every Agent action to a concrete executor case', () => {
    const memberNames = collectExecutorCaseMembers(
      readFileSync(EXECUTOR_PATH, 'utf8'),
    );
    const executorNames = new Set(
      [...memberNames]
        .map((member) => AgentToolName[member as keyof typeof AgentToolName])
        .filter((name): name is AgentToolName => typeof name === 'string'),
    );
    const missing = getToolsForSurface('agent')
      .map((tool) => tool.name)
      .filter((name) => !executorNames.has(name as AgentToolName));

    expect(missing).toEqual([]);
  });
});
