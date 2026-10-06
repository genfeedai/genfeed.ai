import { MCP_SERVER_INSTRUCTIONS } from '@mcp/mcp/server-identity';

describe('MCP server instructions', () => {
  it('tells the client to read callable model keys before generate', () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain('get_generation_options');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('models key');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('Do not invent model aliases');
  });
});
