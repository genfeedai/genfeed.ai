import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';

const WEBSITE_ORIGIN = 'https://genfeed.ai';
const MCP_ENDPOINT = 'https://mcp.genfeed.ai/mcp';
const AGENT_SKILLS_SCHEMA =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

function resolveProductSkillsDirectory(): string {
  const candidates = [
    resolve(process.cwd(), '../../skills'),
    resolve(process.cwd(), 'skills'),
  ];
  const directory = candidates.find((candidate) => existsSync(candidate));

  if (!directory) {
    throw new Error('Unable to locate the public product skills directory.');
  }

  return directory;
}

const PRODUCT_SKILLS_DIRECTORY = resolveProductSkillsDirectory();

export const PUBLISHED_AGENT_SKILL_NAMES = Object.freeze(
  readdirSync(PRODUCT_SKILLS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    .filter((name) =>
      existsSync(resolve(PRODUCT_SKILLS_DIRECTORY, name, 'SKILL.md')),
    )
    .sort(),
);

export interface PublishedAgentSkill {
  content: string;
  description: string;
  name: string;
}

function readFrontmatterDescription(content: string, name: string): string {
  const match = /^description:\s*(.+)$/m.exec(content);
  if (!match?.[1]) {
    throw new Error(`Public skill ${name} is missing a description.`);
  }

  return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

export function getPublishedAgentSkill(
  name: string,
): PublishedAgentSkill | null {
  if (!PUBLISHED_AGENT_SKILL_NAMES.includes(name)) {
    return null;
  }

  const content = readFileSync(
    resolve(PRODUCT_SKILLS_DIRECTORY, name, 'SKILL.md'),
    'utf8',
  );

  return {
    content,
    description: readFrontmatterDescription(content, name),
    name,
  };
}

export function buildAgentSkillsIndex() {
  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: PUBLISHED_AGENT_SKILL_NAMES.map((name) => {
      const skill = getPublishedAgentSkill(name);
      if (!skill) {
        throw new Error(`Public skill ${name} disappeared during discovery.`);
      }

      return {
        description: skill.description,
        digest: `sha256:${createHash('sha256').update(skill.content).digest('hex')}`,
        name,
        type: 'skill-md',
        url: `${WEBSITE_ORIGIN}/.well-known/agent-skills/${name}/SKILL.md`,
      };
    }),
  };
}

export function buildMcpServerCard() {
  return {
    $schema:
      'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
    authentication: {
      required: true,
      schemes: ['bearer', 'oauth2'],
    },
    capabilities: {
      resources: {},
      tools: {},
    },
    description:
      'Create, review, automate, and publish content through Genfeed.',
    documentationUrl: 'https://docs.genfeed.ai/api-reference/mcp',
    iconUrl: 'https://cdn.genfeed.ai/assets/branding/logo.jpg',
    protocolVersion: '2025-06-18',
    serverInfo: {
      name: 'genfeed-mcp-server',
      title: 'Genfeed MCP Server',
      version: '1.0.0',
    },
    transport: {
      endpoint: MCP_ENDPOINT,
      type: 'streamable-http',
    },
    version: '1.0',
  };
}

export function buildWebsiteProtectedResourceMetadata() {
  return {
    authorization_servers: ['https://api.genfeed.ai'],
    bearer_methods_supported: ['header'],
    resource: WEBSITE_ORIGIN,
    resource_name: 'Genfeed',
    scopes_supported: [...API_KEY_SCOPE_PRESETS.mcp],
  };
}

export const HOMEPAGE_AGENT_MARKDOWN = `# Genfeed.ai

> The open-source AI operating system for content creation, automation, publishing, and analytics.

## Start here

- [Product overview](${WEBSITE_ORIGIN}/features)
- [Pricing](${WEBSITE_ORIGIN}/pricing)
- [Documentation](https://docs.genfeed.ai)
- [Developer guide](${WEBSITE_ORIGIN}/developers)
- [Agent Skills](${WEBSITE_ORIGIN}/skills)

## Agent discovery

- [API catalog](${WEBSITE_ORIGIN}/.well-known/api-catalog)
- [MCP server card](${WEBSITE_ORIGIN}/.well-known/mcp/server-card.json)
- [Agent Skills index](${WEBSITE_ORIGIN}/.well-known/agent-skills/index.json)
- [OAuth instructions](${WEBSITE_ORIGIN}/auth.md)
- [LLM index](${WEBSITE_ORIGIN}/llms.txt)
- [Full LLM context](${WEBSITE_ORIGIN}/llms-full.txt)
`;

export const AUTH_MARKDOWN = `# Genfeed auth.md

Genfeed supports OAuth 2.0 Authorization Code with PKCE for interactive agents and scoped \`gf_\` API keys for server-to-server clients.

## Discover OAuth

1. Read the [Genfeed protected resource metadata](${WEBSITE_ORIGIN}/.well-known/oauth-protected-resource).
2. Read the [MCP protected resource metadata](https://mcp.genfeed.ai/.well-known/oauth-protected-resource) when connecting to MCP.
3. Read the [authorization server metadata](https://api.genfeed.ai/.well-known/oauth-authorization-server).
4. Dynamically register a public client with \`POST https://api.genfeed.ai/v1/oauth/register\`. Provide \`redirect_uris\`, use \`authorization_code\`, and set \`token_endpoint_auth_method\` to \`none\`.
5. Send the user through the advertised authorization endpoint with a PKCE S256 challenge.
6. Exchange the returned code at the advertised token endpoint and send the access token as an HTTP Bearer token.

## API keys

Headless agents can create a scoped key from [Genfeed Connect](https://app.genfeed.ai/connect). Send it as \`Authorization: Bearer <gf_...>\` to the [MCP endpoint](https://mcp.genfeed.ai/mcp) or the REST API. Treat keys as secrets and never place them in prompts, logs, or source control.

See the [MCP setup guide](https://docs.genfeed.ai/api-reference/mcp) and [API key guide](https://docs.genfeed.ai/api-reference/api-keys) for scopes, rotation, and revocation.
`;
