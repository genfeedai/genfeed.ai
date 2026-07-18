import {
  ActionOrigin,
  API_KEY_ACTION_ORIGIN_METADATA_KEY,
  API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY,
  MCP_ACTION_ORIGIN_PROOF_HEADER,
} from '../src/action-origin.enum';

describe('ActionOrigin', () => {
  it('defines the complete normalized origin taxonomy', () => {
    expect(Object.values(ActionOrigin)).toEqual([
      'agent',
      'api',
      'cli',
      'mcp',
      'ui',
      'unknown',
      'workflow',
    ]);
  });

  it('exports stable trusted-boundary contract keys', () => {
    expect(API_KEY_ACTION_ORIGIN_METADATA_KEY).toBe('actionOrigin');
    expect(API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY).toBe('actionOriginProof');
    expect(MCP_ACTION_ORIGIN_PROOF_HEADER).toBe('x-genfeed-mcp-origin-proof');
  });
});
