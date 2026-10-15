import {
  buildClaudeMcpServerInstructions,
  getMcpServerInfo,
  MCP_SERVER_INSTRUCTIONS,
} from '@mcp/mcp/server-identity';

describe('MCP server instructions', () => {
  it('tells the client to read callable model keys before generate', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('get_generation_options');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('models key');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Do not invent model aliases');
  });

  it('describes Claude capabilities without directing external navigation', () => {
    const instructions = buildClaudeMcpServerInstructions();
    expect(instructions).toContain('unavailable through this connector');
    expect(instructions).not.toContain('Open that link');
    expect(instructions).not.toMatch(/https?:\/\//);
  });

  it('describes only the restricted capabilities in Claude server metadata', () => {
    const server = getMcpServerInfo(
      'https://mcp.genfeed.ai/mcp',
      'https://genfeed.ai',
      'claude',
    );
    expect(server.description).toContain('drafts');
    expect(server.description).not.toMatch(/images|videos|generation/);
  });
});
