import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { materializeJsonDocumentSchema } from './contracts/schema-builders';
import {
  CURATED_ACTION_CATALOG,
  getCuratedAction,
  isActionOnSurface,
} from './curated-action-catalog';
import {
  MUTATION_POLICY_BY_NAME,
  toolRequiresMutationPolicy,
} from './mutation-policy';
import { SOURCE_TOOLS } from './source/index';
import { deriveMcpToolPresentation } from './source/tool-annotations';
import { toolDataSource } from './source/tool-data-sources';
import {
  appendCreditPricingDescription,
  toolCreditPricingFor,
} from './tool-credit-pricing';

/**
 * Assembles `ALL_TOOLS` from the curated catalog and the hand-authored tool
 * definitions. Deliberately has no dependency on `./toolsets` or
 * `./tool-registry` — both of those import `ALL_TOOLS` from here, so this
 * module must stay a leaf to avoid a circular import between them (the two
 * files each need a `const` the other declares, which would throw a
 * temporal-dead-zone error at module load whenever the load graph enters
 * through the "wrong" side of a real cycle).
 */

const definitionsByName = new Map(
  SOURCE_TOOLS.map((tool) => [tool.name, tool]),
);
const catalogNames: ReadonlySet<string> = new Set(
  CURATED_ACTION_CATALOG.map((entry) => entry.name),
);

const duplicateDefinitionNames = SOURCE_TOOLS.filter(
  (tool, index) =>
    SOURCE_TOOLS.findIndex((candidate) => candidate.name === tool.name) !==
    index,
).map((tool) => tool.name);
const duplicateCatalogNames = CURATED_ACTION_CATALOG.filter(
  (entry, index) =>
    CURATED_ACTION_CATALOG.findIndex(
      (candidate) => candidate.name === entry.name,
    ) !== index,
).map((entry) => entry.name);
const missingDefinitions = CURATED_ACTION_CATALOG.filter(
  (entry) => !definitionsByName.has(entry.name),
).map((entry) => entry.name);
const unreviewedDefinitions = SOURCE_TOOLS.filter(
  (tool) => !catalogNames.has(tool.name),
).map((tool) => tool.name);

const catalogViolations = [
  duplicateDefinitionNames.length > 0
    ? `duplicate definitions: ${duplicateDefinitionNames.join(', ')}`
    : null,
  duplicateCatalogNames.length > 0
    ? `duplicate catalog entries: ${duplicateCatalogNames.join(', ')}`
    : null,
  missingDefinitions.length > 0
    ? `missing definitions: ${missingDefinitions.join(', ')}`
    : null,
  unreviewedDefinitions.length > 0
    ? `definitions absent from the curated catalog: ${unreviewedDefinitions.join(', ')}`
    : null,
].filter((violation): violation is string => violation !== null);

if (catalogViolations.length > 0) {
  throw new Error(
    `Invalid curated action catalog: ${catalogViolations.join('; ')}`,
  );
}

const CANONICAL_SOURCE_TOOLS: CanonicalToolDefinition[] =
  CURATED_ACTION_CATALOG.map((entry) => {
    const tool = definitionsByName.get(entry.name);
    if (!tool) {
      throw new Error(`Missing curated action definition: ${entry.name}`);
    }

    const curated = getCuratedAction(entry.name);
    const agent = isActionOnSurface(entry, 'agent');
    const mcp = isActionOnSurface(entry, 'mcp');
    const mutationPolicy = MUTATION_POLICY_BY_NAME[tool.name];
    const creditPricing = toolCreditPricingFor(tool.name, tool.creditCost);
    const presentation = mcp
      ? deriveMcpToolPresentation(tool.name, mutationPolicy)
      : undefined;
    return {
      ...(presentation ? { annotations: presentation.annotations } : {}),
      category: entry.category,
      creditCost: tool.creditCost,
      creditPricing,
      dataSource: toolDataSource(tool.name),
      description: appendCreditPricingDescription(
        tool.description,
        creditPricing,
      ),
      ...(tool.mcpDescription
        ? {
            mcpDescription: appendCreditPricingDescription(
              tool.mcpDescription,
              creditPricing,
            ),
          }
        : {}),
      ...(tool.mcpHiddenParameters
        ? { mcpHiddenParameters: tool.mcpHiddenParameters }
        : {}),
      name: entry.name,
      parameters: {
        ...tool.parameters,
        ...materializeJsonDocumentSchema(tool.parameters),
      },
      requiredRole: tool.requiredRole,
      surfaces: {
        agent,
        cliAgentVisible: agent,
        mcp,
      },
      ...(presentation ? { title: presentation.title } : {}),
      toolset: entry.toolset,
      uiActionType: curated?.uiActionType,
      ...(mutationPolicy ? { mutationPolicy } : {}),
    };
  });

/**
 * Curated product actions only. HTTP endpoints remain documented by OpenAPI,
 * but they do not become Agent or MCP actions automatically.
 */
export const ALL_TOOLS: CanonicalToolDefinition[] = CANONICAL_SOURCE_TOOLS.sort(
  (a, b) => a.name.localeCompare(b.name),
);

const missingMutationPolicies = ALL_TOOLS.filter(
  (tool) =>
    toolRequiresMutationPolicy(tool.name) && tool.mutationPolicy === undefined,
).map((tool) => tool.name);
if (missingMutationPolicies.length > 0) {
  throw new Error(
    `canonical write tools missing mutationPolicy: ${missingMutationPolicies.join(', ')}`,
  );
}

const missingAnnotations = ALL_TOOLS.filter((tool) => {
  if (!tool.surfaces.mcp) return false;
  const annotations = tool.annotations;
  return (
    typeof tool.title !== 'string' ||
    tool.title.length === 0 ||
    annotations === undefined ||
    typeof annotations.readOnlyHint !== 'boolean' ||
    typeof annotations.destructiveHint !== 'boolean' ||
    typeof annotations.idempotentHint !== 'boolean' ||
    typeof annotations.openWorldHint !== 'boolean'
  );
}).map((tool) => tool.name);
if (missingAnnotations.length > 0) {
  throw new Error(
    `MCP-surfaced tools missing title or readOnlyHint: ${missingAnnotations.join(', ')}`,
  );
}
