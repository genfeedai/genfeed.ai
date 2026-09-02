import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectDispatchedToolNames,
  parseToolNameEnum,
  runCheckAgentToolDispatch,
} from './check-agent-tool-dispatch';

const CATALOG_PATH = 'packages/actions/src/registry/curated-action-catalog.ts';
const ENUM_PATH = 'packages/interfaces/src/ai/agent-tool.interface.ts';
const AGENT_TYPE_CONFIG_PATH =
  'apps/server/api/src/services/agent-orchestrator/constants/agent-type-config.constant.ts';
const BRANDLESS_TOOLS_PATH =
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts';
const DISPATCH_PATH =
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts';

const ENUM_SOURCE = `
  export enum AgentToolName {
    GENERATE_AD_PACK = 'generate_ad_pack',
    GET_WORKFLOW_INPUTS = 'get_workflow_inputs',
    LIST_BRANDS = 'list_brands',
  }
`;

function catalogSource(
  entries: Array<{ name: string; surfaces: string[] }>,
): string {
  const lines = entries
    .map(
      (entry) =>
        `  { name: '${entry.name}', surfaces: [${entry.surfaces
          .map((surface) => `'${surface}'`)
          .join(', ')}] },`,
    )
    .join('\n');

  return `export const CURATED_ACTION_CATALOG = [\n${lines}\n] as const satisfies readonly CuratedActionCatalogEntry[];\n`;
}

function dispatchSource(members: string[]): string {
  const cases = members
    .map(
      (member) =>
        `        case AgentToolName.${member}:\n          return this.run();`,
    )
    .join('\n');

  return `
    export class AgentToolExecutorService {
      private dispatch(toolName: AgentToolName) {
        switch (toolName) {
${cases}
          default:
            return { error: 'Unknown tool' };
        }
      }
    }
  `;
}

function defaultToolsSource(members: string[]): string {
  const entries = members
    .map((member) => `        AgentToolName.${member},`)
    .join('\n');

  return `
    export const AGENT_TYPE_CONFIGS = {
      general: {
        defaultTools: [
${entries}
        ],
      },
    };
  `;
}

function brandlessToolsSource(members: string[]): string {
  const entries = members
    .map((member) => `      AgentToolName.${member},`)
    .join('\n');

  return `
    const BRANDLESS_AGENT_TOOLS = new Set<AgentToolName>([
${entries}
    ]);
  `;
}

describe('check-agent-tool-dispatch', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'agent-tool-dispatch-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('passes when every agent-surfaced action has a dispatch case', () => {
    writeFixtures({
      catalog: [
        { name: 'generate_ad_pack', surfaces: ['agent'] },
        { name: 'get_workflow_inputs', surfaces: ['agent'] },
        { name: 'list_brands', surfaces: ['agent', 'mcp'] },
      ],
      dispatch: ['GENERATE_AD_PACK', 'GET_WORKFLOW_INPUTS', 'LIST_BRANDS'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([]);
    expect(result.advertisedActions).toHaveLength(3);
    expect(result.surfacedActions).toHaveLength(3);
  });

  it('flags an agent-surfaced action with no dispatch case', () => {
    writeFixtures({
      catalog: [
        { name: 'generate_ad_pack', surfaces: ['agent'] },
        { name: 'get_workflow_inputs', surfaces: ['agent'] },
      ],
      dispatch: ['GENERATE_AD_PACK'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({
        action: 'get_workflow_inputs',
        kind: 'missing-dispatch',
      }),
    ]);
  });

  it('flags a default tool with no dispatch case', () => {
    writeFixtures({
      brandless: [],
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      defaultTools: ['GENERATE_AD_PACK', 'GET_WORKFLOW_INPUTS'],
      dispatch: ['GENERATE_AD_PACK'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({
        action: 'get_workflow_inputs',
        kind: 'missing-dispatch',
        surfaces: ['defaultTools'],
      }),
    ]);
  });

  it('follows helper arrays spread into defaultTools', () => {
    writeFixtures({
      brandless: [],
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      defaultTools: [],
      dispatch: ['GENERATE_AD_PACK'],
    });
    writeFixture(
      AGENT_TYPE_CONFIG_PATH,
      `
        const SHARED_READ_TOOLS = [AgentToolName.GET_WORKFLOW_INPUTS];
        export const AGENT_TYPE_CONFIGS = {
          general: { defaultTools: [AgentToolName.GENERATE_AD_PACK, ...SHARED_READ_TOOLS] },
        };
      `,
    );

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({
        action: 'get_workflow_inputs',
        kind: 'missing-dispatch',
        surfaces: ['defaultTools'],
      }),
    ]);
  });

  it('treats Object.values(AgentToolName) as advertising every enum member', () => {
    writeFixtures({
      brandless: [],
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      defaultTools: [],
      dispatch: ['GENERATE_AD_PACK'],
    });
    writeFixture(
      AGENT_TYPE_CONFIG_PATH,
      `
        export const AGENT_TYPE_CONFIGS = {
          general: { defaultTools: [...Object.values(AgentToolName)] },
        };
      `,
    );

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'get_workflow_inputs' }),
        expect.objectContaining({ action: 'list_brands' }),
      ]),
    );
    expect(result.violations).toHaveLength(2);
  });

  it('flags a brandless tool with no dispatch case', () => {
    writeFixtures({
      brandless: ['GENERATE_AD_PACK', 'GET_WORKFLOW_INPUTS'],
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      defaultTools: ['GENERATE_AD_PACK'],
      dispatch: ['GENERATE_AD_PACK'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({
        action: 'get_workflow_inputs',
        kind: 'missing-dispatch',
        surfaces: ['BRANDLESS_AGENT_TOOLS'],
      }),
    ]);
  });

  it('flags a dispatch case the catalog does not surface to the agent', () => {
    writeFixtures({
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      dispatch: ['GENERATE_AD_PACK', 'GET_WORKFLOW_INPUTS'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({
        action: 'get_workflow_inputs',
        kind: 'unreviewed-dispatch',
      }),
    ]);
  });

  it('treats an MCP-only action as unreviewed when the agent dispatches it', () => {
    writeFixtures({
      catalog: [
        { name: 'generate_ad_pack', surfaces: ['agent'] },
        { name: 'list_brands', surfaces: ['mcp'] },
      ],
      dispatch: ['GENERATE_AD_PACK', 'LIST_BRANDS'],
    });

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([
      expect.objectContaining({ action: 'list_brands' }),
    ]);
  });

  it('credits coverage provided by a sibling handler switch', () => {
    writeFixtures({
      catalog: [
        { name: 'generate_ad_pack', surfaces: ['agent'] },
        { name: 'get_workflow_inputs', surfaces: ['agent'] },
      ],
      dispatch: ['GENERATE_AD_PACK'],
    });
    writeFixture(
      'apps/server/api/src/services/agent-orchestrator/tools/agent-workflow-tool-handler.service.ts',
      dispatchSource(['GET_WORKFLOW_INPUTS']),
    );

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([]);
  });

  it('ignores dispatch cases in test files', () => {
    writeFixtures({
      catalog: [{ name: 'generate_ad_pack', surfaces: ['agent'] }],
      dispatch: ['GENERATE_AD_PACK'],
    });
    writeFixture(
      'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.spec.ts',
      dispatchSource(['GET_WORKFLOW_INPUTS']),
    );

    const result = runCheckAgentToolDispatch();

    expect(result.violations).toEqual([]);
  });

  it('reads wire names off the AgentToolName enum', () => {
    expect(parseToolNameEnum(ENUM_SOURCE).get('GENERATE_AD_PACK')).toBe(
      'generate_ad_pack',
    );
  });

  it('ignores switches over string literals', () => {
    const source = `
      function renderWidget(kind: string) {
        switch (kind) {
          case 'metric_card':
            return 1;
          default:
            return 0;
        }
      }
    `;

    expect(
      collectDispatchedToolNames(source, parseToolNameEnum(ENUM_SOURCE)),
    ).toEqual([]);
  });
});

function writeFixtures(fixtures: {
  brandless?: string[];
  catalog: Array<{ name: string; surfaces: string[] }>;
  defaultTools?: string[];
  dispatch: string[];
}): void {
  writeFixture(CATALOG_PATH, catalogSource(fixtures.catalog));
  writeFixture(ENUM_PATH, ENUM_SOURCE);
  writeFixture(
    AGENT_TYPE_CONFIG_PATH,
    defaultToolsSource(fixtures.defaultTools ?? fixtures.dispatch),
  );
  writeFixture(
    BRANDLESS_TOOLS_PATH,
    brandlessToolsSource(fixtures.brandless ?? fixtures.dispatch),
  );
  writeFixture(DISPATCH_PATH, dispatchSource(fixtures.dispatch));
}

function writeFixture(relativePath: string, contents: string): void {
  const absolutePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, 'utf8');
}
