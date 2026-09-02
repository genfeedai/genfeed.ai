import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';

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
    name: 'genfeed-mcp-server',
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

Genfeed gives creators, agencies, marketing teams, and autonomous agents one system for researching ideas, generating media and copy, reviewing drafts, scheduling releases, publishing to connected channels, and measuring the results. It is available as a managed cloud product and as an AGPL-licensed self-hosted stack.

## When to use Genfeed

Use Genfeed when a workflow needs to turn a brief, trend, source asset, or campaign goal into structured content and carry that work through review, approval, publication, and analytics. The platform is a good fit for repeatable multi-channel programs, batch media generation, content repurposing, scheduled publishing, and agent-driven operations that still require human approval for consequential actions.

Do not use Genfeed as a general-purpose chat service or as an unreviewed path for external publishing. Mutating MCP actions declare their approval requirements, credentials are scoped, and callers should request only the permissions needed for the task.

## Start here

- [Product overview](${WEBSITE_ORIGIN}/features)
- [Pricing](${WEBSITE_ORIGIN}/pricing)
- [Documentation](https://docs.genfeed.ai)
- [Developer guide](${WEBSITE_ORIGIN}/developers)
- [Agent Skills](${WEBSITE_ORIGIN}/skills)

## Developer interfaces

- [OpenAPI document](https://api.genfeed.ai/v1/openapi.json) — the canonical typed REST contract, versioned under /v1.
- [MCP endpoint](${MCP_ENDPOINT}) — Streamable HTTP tools and resources for compatible agents.
- [MCP setup guide](https://docs.genfeed.ai/api-reference/mcp) — connection, OAuth, API-key, and scope instructions.
- [Command-line interface](https://www.npmjs.com/package/@genfeedai/cli) — install with npm install --global @genfeedai/cli, then run genfeed --help.
- [REST documentation](https://docs.genfeed.ai/api-reference) — guides and endpoint reference.

All protected requests use a bearer credential. Read [auth.md](${WEBSITE_ORIGIN}/auth.md) before registering an agent, and preserve the advertised OAuth and scope boundaries. REST errors use a JSON:API error document. Rate-limited responses include both standard RateLimit-* metadata and Retry-After when blocked.

## Product boundaries

Genfeed combines Studio for generation, Library for assets, Publisher and Calendar for distribution, Workflows for automation, Research for discovery, Brand OS for reusable context, and Analytics for measurement. Self-hosted installations own their infrastructure, data, storage, and model-provider credentials. Managed cloud handles those operations and meters generated output rather than imposing fixed content-count caps.

Pricing and current plan details are published on the pricing page. Agents should not infer price, feature availability, or account entitlement from this summary; use the linked product pages and authenticated API responses as the source of truth.

## Agent discovery

- [API catalog](${WEBSITE_ORIGIN}/.well-known/api-catalog)
- [MCP server card](${WEBSITE_ORIGIN}/.well-known/mcp/server-card.json)
- [Agent Skills index](${WEBSITE_ORIGIN}/.well-known/agent-skills/index.json)
- [OAuth instructions](${WEBSITE_ORIGIN}/auth.md)
- [LLM index](${WEBSITE_ORIGIN}/llms.txt)
- [Full LLM context](${WEBSITE_ORIGIN}/llms-full.txt)
- [Contact and support](${WEBSITE_ORIGIN}/contact)
`;

export const AUTH_MARKDOWN = `# Genfeed auth.md

Genfeed supports verified-email agent registration that issues a scoped, 30-day \`gf_\` API key after the user signs in and confirms a six-digit code. No credential is issued before that confirmation.

## 1. Discover

1. Read the [Genfeed protected resource metadata](${WEBSITE_ORIGIN}/.well-known/oauth-protected-resource).
2. Read the [MCP protected resource metadata](https://mcp.genfeed.ai/.well-known/oauth-protected-resource) when connecting to MCP.
3. Read the [authorization server metadata](https://api.genfeed.ai/.well-known/oauth-authorization-server).

The authorization-server document includes an \`agent_auth\` block. Use its \`register_uri\`, \`claim_uri\`, and \`revocation_uri\` instead of guessing endpoint paths.

## 2. Register with verified email

Confirm with the user which Genfeed scopes the agent will request, then send:

\`\`\`http
POST https://api.genfeed.ai/v1/agent/auth
Content-Type: application/json

{
  "type": "identity_assertion",
  "assertion_type": "verified_email",
  "assertion": "user@example.com",
  "requested_credential_type": "api_key",
  "requested_scopes": ["videos:read", "images:create"]
}
\`\`\`

Agents using the newer service-auth name may send \`{"type":"service_auth","login_hint":"user@example.com",...}\` to the same endpoint. The response contains a one-time \`claim_token\` plus a \`claim\` object with \`user_code\`, \`verification_uri\`, \`expires_in\`, and \`interval\`.

## 3. Hand the claim to the user

Show \`claim.verification_uri\` and \`claim.user_code\` to the user together. The user opens the URL, signs in with the same verified email, and enters the six-digit code. The URL contains an opaque \`claim_attempt_token\`; never replace it with the user code or log either token.

The claim page submits the authenticated confirmation to \`POST https://api.genfeed.ai/v1/agent/auth/claim/complete\`. Agents must not call that endpoint because it requires the user's Genfeed session.

## 4. Exchange the completed claim

Honor the advertised polling interval and send:

\`\`\`http
POST https://api.genfeed.ai/v1/agent/auth/claim
Content-Type: application/json

{"claim_token":"<claim_token>"}
\`\`\`

Before confirmation the endpoint returns \`authorization_pending\`. After confirmation it returns \`credential_type: "api_key"\`, the copy-once \`credential\`, its expiry, and granted scopes. A claim can be exchanged only once.

## 5. Use and revoke the credential

Send the credential as \`Authorization: Bearer <gf_...>\` to the [MCP endpoint](https://mcp.genfeed.ai/mcp) or REST API. Treat it as a secret and never place it in prompts, logs, URLs, or source control.

Revoke an Auth.md-issued credential by proving possession:

\`\`\`http
POST https://api.genfeed.ai/v1/agent/auth/revoke
Content-Type: application/json

{"token":"<gf_...>"}
\`\`\`

On expiry, revocation, or a 401 from a previously working credential, discard it and restart discovery. The revocation endpoint refuses to revoke keys that were not issued through this registration flow.

## OAuth fallback

Interactive agents may instead dynamically register a public OAuth client at \`POST https://api.genfeed.ai/v1/oauth/register\`, send the user through Authorization Code with PKCE S256, and exchange the code at the advertised token endpoint.

See the [MCP setup guide](https://docs.genfeed.ai/api-reference/mcp) and [API key guide](https://docs.genfeed.ai/api-reference/api-keys) for scopes, rotation, and revocation.
`;
