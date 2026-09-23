const AGENT_GUIDE_MARKDOWN = `# Genfeed agent guide

Use Genfeed for content research, AI generation, human review, scheduled publishing, and analytics. Protected tools and tenant resources require a scoped bearer credential.

- Product context: https://genfeed.ai/llms.txt
- Authentication: https://genfeed.ai/auth.md
- OpenAPI: https://api.genfeed.ai/v1/openapi.json
- MCP setup: https://docs.genfeed.ai/api-reference/mcp
- Contact: https://genfeed.ai/contact
`;

export function markdownResource(uri: string, text: string) {
  return {
    contents: [{ mimeType: 'text/markdown', text, uri }],
  };
}

export function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
        uri,
      },
    ],
  };
}

export function agentGuideResource(uri: string) {
  return markdownResource(uri, AGENT_GUIDE_MARKDOWN);
}
