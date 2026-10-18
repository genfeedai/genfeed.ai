import {
  buildMcpOAuthSessionMetadata,
  readMcpOAuthSessionLineage,
} from '@api/oauth/mcp-oauth-session-metadata.util';

const resource = 'https://mcp.genfeed.ai/mcp';

describe('MCP OAuth session metadata', () => {
  it('leaves organization switching out unless the user allowed it', () => {
    const metadata = buildMcpOAuthSessionMetadata(resource, {
      activeOrganizationId: 'org-2',
      grantId: 'grant-1',
    });

    expect(metadata).not.toHaveProperty('canSwitchOrganizations');
    expect(metadata).not.toHaveProperty('activeOrganizationId');
  });

  it('records the switching choice and the active organization', () => {
    expect(
      buildMcpOAuthSessionMetadata(resource, {
        activeOrganizationId: 'org-2',
        canSwitchOrganizations: true,
        grantId: 'grant-1',
      }),
    ).toMatchObject({
      activeOrganizationId: 'org-2',
      canSwitchOrganizations: true,
      grantId: 'grant-1',
      kind: 'mcp-oauth-session',
    });
  });

  it('round-trips the lineage across a refresh rotation', () => {
    const metadata = buildMcpOAuthSessionMetadata(resource, {
      activeOrganizationId: 'org-2',
      canSwitchOrganizations: true,
      clientName: 'Claude Code',
      grantId: 'grant-1',
    });

    expect(readMcpOAuthSessionLineage(metadata, 'fallback')).toMatchObject({
      activeOrganizationId: 'org-2',
      canSwitchOrganizations: true,
      clientName: 'Claude Code',
      grantId: 'grant-1',
    });
  });

  it('reads a key without switching metadata as not switchable', () => {
    expect(
      readMcpOAuthSessionLineage({ kind: 'mcp-oauth-session' }, 'key-1'),
    ).toMatchObject({
      activeOrganizationId: undefined,
      canSwitchOrganizations: false,
      grantId: 'key-1',
    });
  });
});
