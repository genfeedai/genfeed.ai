/**
 * Desktop Schema Drift Detector
 *
 * The desktop app (packages/desktop-prisma, PGlite) keeps a reduced local
 * projection of a handful of server models (packages/prisma). The two schemas
 * are edited by hand, so nothing structurally prevents them from drifting:
 * a server field can be renamed away from under a desktop mirror, or a desktop
 * field can be added without anyone deciding how it syncs.
 *
 * This check enforces an explicit contract:
 *  - Every non-`Desktop*` model in the desktop schema must be declared in
 *    CONTRACT, and every scalar field on it must be classified as either
 *      { server: '<field>' } — mirrors a server schema column (validated
 *                              against packages/prisma on every run),
 *      'projection'          — populated from the cloud API response; no
 *                              same-name server column backs it directly,
 *      'desktop-local'       — only meaningful on-device, never synced.
 *  - Stale contract entries (model/field no longer in the desktop schema)
 *    fail the check, so the contract cannot rot.
 *
 * When this check fails you either renamed/removed a server field the desktop
 * app mirrors (fix the desktop schema + sync code, or update the contract
 * consciously), or you added a desktop field without classifying it here.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_SCHEMA_PATH = path.join(
  ROOT_DIR,
  'packages/prisma/prisma/schema.prisma',
);
const DESKTOP_SCHEMA_PATH = path.join(
  ROOT_DIR,
  'packages/desktop-prisma/prisma/schema.prisma',
);

/** Desktop models with this prefix are device-only and exempt from the contract. */
const DESKTOP_ONLY_PREFIX = 'Desktop';

type FieldMapping = { server: string } | 'projection' | 'desktop-local';

type ModelContract = {
  fields: Record<string, FieldMapping>;
  serverModel: string;
};

const CONTRACT: Record<string, ModelContract> = {
  AgentStrategy: {
    fields: {
      avatar: 'projection',
      createdAt: { server: 'createdAt' },
      id: { server: 'id' },
      isActive: { server: 'isActive' },
      lastRunAt: 'projection',
      name: 'projection',
      organizationId: { server: 'organizationId' },
      // Server stores String[]; desktop flattens to a JSON string column.
      platformsJson: 'projection',
      status: 'projection',
      updatedAt: { server: 'updatedAt' },
    },
    serverModel: 'AgentStrategy',
  },
  Ingredient: {
    fields: {
      content: 'projection',
      createdAt: { server: 'createdAt' },
      id: { server: 'id' },
      organizationId: { server: 'organizationId' },
      platform: 'projection',
      sourcePostId: 'projection',
      title: 'projection',
      totalVotes: 'projection',
      updatedAt: { server: 'updatedAt' },
    },
    serverModel: 'Ingredient',
  },
  Organization: {
    fields: {
      createdAt: { server: 'createdAt' },
      id: { server: 'id' },
      // Server calls this column `label`; the cloud API serializes it as `name`.
      name: { server: 'label' },
      slug: { server: 'slug' },
      updatedAt: { server: 'updatedAt' },
    },
    serverModel: 'Organization',
  },
  Post: {
    fields: {
      content: 'projection',
      createdAt: { server: 'createdAt' },
      engagements: 'projection',
      id: { server: 'id' },
      organizationId: { server: 'organizationId' },
      platform: { server: 'platform' },
      prompt: 'projection',
      publishedAt: { server: 'publishedAt' },
      publishIntent: { server: 'publishIntent' },
      sourceDraftId: 'projection',
      sourceTrendId: 'projection',
      sourceTrendTopic: 'projection',
      status: { server: 'status' },
      type: 'projection',
      updatedAt: { server: 'updatedAt' },
      views: 'projection',
      workspaceId: 'desktop-local',
    },
    serverModel: 'Post',
  },
  Trend: {
    fields: {
      createdAt: { server: 'createdAt' },
      engagementScore: 'projection',
      id: { server: 'id' },
      organizationId: { server: 'organizationId' },
      platform: { server: 'platform' },
      summary: 'projection',
      topic: { server: 'topic' },
      viralityScore: { server: 'viralityScore' },
    },
    serverModel: 'Trend',
  },
  User: {
    fields: {
      authProviderId: { server: 'authProviderId' },
      createdAt: { server: 'createdAt' },
      email: { server: 'email' },
      id: { server: 'id' },
      name: { server: 'name' },
      // Local single-org pointer; server users belong to orgs via Member rows.
      organizationId: 'desktop-local',
      updatedAt: { server: 'updatedAt' },
    },
    serverModel: 'User',
  },
  Workflow: {
    fields: {
      createdAt: { server: 'createdAt' },
      description: { server: 'description' },
      id: { server: 'id' },
      lastExecutedAt: { server: 'lastExecutedAt' },
      lifecycle: { server: 'lifecycle' },
      name: 'projection',
      nodeCount: 'projection',
      organizationId: { server: 'organizationId' },
      supportsBatch: 'projection',
      updatedAt: { server: 'updatedAt' },
    },
    serverModel: 'Workflow',
  },
  WorkflowExecution: {
    fields: {
      // Server WorkflowExecution carries no strategy column; the desktop app
      // associates executions to strategies from the cloud API response.
      agentStrategyId: 'projection',
      completedAt: { server: 'completedAt' },
      id: { server: 'id' },
      mode: 'projection',
      startedAt: { server: 'startedAt' },
      status: { server: 'status' },
      workflowId: { server: 'workflowId' },
    },
    serverModel: 'WorkflowExecution',
  },
};

type ParsedSchema = Map<string, Set<string>>;

function parseSchema(schemaPath: string): ParsedSchema {
  const source = fs.readFileSync(schemaPath, 'utf8');
  const models = new Map<string, Set<string>>();
  const modelNames = new Set<string>();

  const modelBlockPattern = /^model\s+(\w+)\s+\{$/;
  let currentModel: string | null = null;
  const rawFields = new Map<string, Map<string, string>>();

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (currentModel === null) {
      const match = modelBlockPattern.exec(trimmed);
      if (match) {
        currentModel = match[1];
        modelNames.add(currentModel);
        rawFields.set(currentModel, new Map());
      }
      continue;
    }
    if (trimmed === '}') {
      currentModel = null;
      continue;
    }
    if (
      trimmed.length === 0 ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('@@')
    ) {
      continue;
    }
    const fieldMatch = /^(\w+)\s+(\S+)/.exec(trimmed);
    if (fieldMatch) {
      rawFields.get(currentModel)?.set(fieldMatch[1], fieldMatch[2]);
    }
  }

  for (const [model, fields] of rawFields) {
    const scalarFields = new Set<string>();
    for (const [fieldName, fieldType] of fields) {
      const baseType = fieldType.replace(/(\[\]|\?)+$/, '');
      // Relation fields point at another model in the same schema; the
      // contract tracks scalar columns only.
      if (modelNames.has(baseType)) {
        continue;
      }
      scalarFields.add(fieldName);
    }
    models.set(model, scalarFields);
  }

  return models;
}

function main(): void {
  const serverModels = parseSchema(SERVER_SCHEMA_PATH);
  const desktopModels = parseSchema(DESKTOP_SCHEMA_PATH);
  const errors: string[] = [];

  for (const [desktopModel, desktopFields] of desktopModels) {
    if (desktopModel.startsWith(DESKTOP_ONLY_PREFIX)) {
      continue;
    }
    const contract = CONTRACT[desktopModel];
    if (!contract) {
      errors.push(
        `Desktop model "${desktopModel}" has no entry in CONTRACT — classify its fields in scripts/check-desktop-schema-drift.ts`,
      );
      continue;
    }
    const serverFields = serverModels.get(contract.serverModel);
    if (!serverFields) {
      errors.push(
        `CONTRACT maps desktop "${desktopModel}" to server model "${contract.serverModel}", which no longer exists in packages/prisma`,
      );
      continue;
    }
    for (const field of desktopFields) {
      const mapping = contract.fields[field];
      if (mapping === undefined) {
        errors.push(
          `Desktop field "${desktopModel}.${field}" is not classified in CONTRACT — declare it as { server: '<field>' }, 'projection', or 'desktop-local'`,
        );
        continue;
      }
      if (typeof mapping === 'object' && !serverFields.has(mapping.server)) {
        errors.push(
          `Desktop field "${desktopModel}.${field}" mirrors server "${contract.serverModel}.${mapping.server}", which no longer exists — the desktop sync contract is broken`,
        );
      }
    }
    for (const contractField of Object.keys(contract.fields)) {
      if (!desktopFields.has(contractField)) {
        errors.push(
          `CONTRACT entry "${desktopModel}.${contractField}" is stale — the field no longer exists in packages/desktop-prisma`,
        );
      }
    }
  }

  for (const contractModel of Object.keys(CONTRACT)) {
    if (!desktopModels.has(contractModel)) {
      errors.push(
        `CONTRACT entry for model "${contractModel}" is stale — the model no longer exists in packages/desktop-prisma`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(
      `Desktop schema drift check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`,
    );
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const mirroredModelCount = Object.keys(CONTRACT).length;
  console.log(
    `Desktop schema drift check passed — ${mirroredModelCount} mirrored models verified against packages/prisma.`,
  );
}

main();
