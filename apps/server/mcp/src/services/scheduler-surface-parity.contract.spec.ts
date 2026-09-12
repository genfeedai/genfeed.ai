import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared scheduler lifecycle contract across REST, MCP, and CLI.
 *
 * Curated read-only discovery stays intentionally MCP-only. This contract
 * covers the lifecycle capabilities issue #1133 requires every surface to
 * share: create, status, cancel, and reschedule.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');

const source = {
  cliApi: read('packages/cli/src/api/schedules.ts'),
  cliCommand: read('packages/cli/src/commands/schedule.ts'),
  mcpCatalog: read('packages/actions/src/registry/curated-action-catalog.ts'),
  mcpDefinitions: read(
    'packages/actions/src/registry/source/mcp-only/scheduler.tools.ts',
  ),
  restController: read(
    'apps/server/api/src/collections/post-groups/controllers/post-groups.controller.ts',
  ),
  restService: read(
    'apps/server/api/src/collections/post-groups/services/post-groups.service.ts',
  ),
};

const SHARED_CAPABILITIES = {
  cancel: {
    cli: [".command('cancel')", "{ action: 'cancel' }"],
    mcp: ["name: 'control_scheduled_release'", "'cancel'"],
    rest: ["@Patch(':id')", "case 'cancel':"],
  },
  create: {
    cli: [
      ".command('bulk')",
      "post<JsonApiCollectionResponse>('/schedules/bulk'",
    ],
    mcp: ["name: 'create_scheduled_release'"],
    rest: ['@Post()', 'async create('],
  },
  reschedule: {
    cli: [".command('reschedule')", '{ scheduledDate }'],
    mcp: ["name: 'update_scheduled_release'", 'scheduledDate:'],
    rest: ["@Patch(':id')", 'input.scheduledDate !== undefined'],
  },
  status: {
    cli: [".command('status')", 'encodeURIComponent(releaseId)'],
    mcp: ["name: 'get_scheduled_release'"],
    rest: ["@Get(':id')", 'async getOne('],
  },
} as const;

describe('REST ↔ MCP ↔ CLI scheduler lifecycle parity', () => {
  for (const [capability, markers] of Object.entries(SHARED_CAPABILITIES)) {
    it(`keeps ${capability} reachable on every surface`, () => {
      for (const marker of markers.cli) {
        expect(
          source.cliApi.includes(marker) || source.cliCommand.includes(marker),
          `CLI is missing ${capability}: ${marker}`,
        ).toBe(true);
      }
      for (const marker of markers.mcp) {
        expect(
          source.mcpDefinitions.includes(marker),
          `MCP is missing ${capability}: ${marker}`,
        ).toBe(true);
      }
      for (const marker of markers.rest) {
        expect(
          source.restController.includes(marker) ||
            source.restService.includes(marker),
          `REST is missing ${capability}: ${marker}`,
        ).toBe(true);
      }
    });
  }

  it('keeps brand publishing-readiness discovery reviewed and MCP-only', () => {
    expect(source.mcpDefinitions).toContain(
      "name: 'list_brand_publishing_readiness'",
    );

    // Read the specific catalog entry's own object literal rather than
    // pinning one exact single-line formatting — each entry now also
    // declares a `toolset` (#4686), so the object always spans multiple
    // lines. Slicing by name keeps this assertion about "mcp-only, not
    // agent" rather than about catalog-entry line layout.
    const entry = catalogEntrySource(
      source.mcpCatalog,
      'list_brand_publishing_readiness',
    );
    expect(entry).toContain("surfaces: ['mcp']");
    expect(entry).not.toContain("'agent'");
    expect(source.cliCommand).not.toContain(".command('publishing-readiness')");
  });
});

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

/** Slices the `{ name: '<name>', ... }` object literal out of a catalog source string. */
function catalogEntrySource(catalogSource: string, name: string): string {
  const marker = `name: '${name}'`;
  const markerIndex = catalogSource.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Catalog entry not found for "${name}"`);
  }

  const objectStart = catalogSource.lastIndexOf('{', markerIndex);
  const objectEnd = catalogSource.indexOf('}', markerIndex);
  return catalogSource.slice(objectStart, objectEnd + 1);
}
