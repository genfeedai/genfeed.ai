import {
  isAgentUntrustedContentSource,
  readAgentUntrustedContentSource,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content-source.util';
import { getToolByName } from '@genfeedai/actions';
import {
  CONNECTOR_TOOLS,
  parseAgentUntrustedContentOrigin,
  USER_UPLOAD_TOOLS,
  WEB_FETCH_TOOLS,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

describe('readAgentUntrustedContentSource', () => {
  it('classifies open-web tools as web_fetch', () => {
    expect(readAgentUntrustedContentSource('search_knowledge')).toBe(
      'web_fetch',
    );
    expect(readAgentUntrustedContentSource('read_knowledge_source')).toBe(
      'web_fetch',
    );
  });

  it('classifies connected-account tools as connector', () => {
    expect(readAgentUntrustedContentSource('list_social_conversations')).toBe(
      'connector',
    );
  });

  it('classifies uploaded-media tools as user_upload', () => {
    expect(readAgentUntrustedContentSource('ingest_source_media')).toBe(
      'user_upload',
    );
  });

  it('classifies platform-derived tools as internal', () => {
    expect(readAgentUntrustedContentSource('get_credits_balance')).toBe(
      'internal',
    );
    expect(readAgentUntrustedContentSource('render_dashboard')).toBe(
      'internal',
    );
  });

  it('treats the merged X and article read tools as web_fetch and the removed names as internal', () => {
    for (const name of ['get_articles', 'get_x_posts']) {
      expect(readAgentUntrustedContentSource(name), name).toBe('web_fetch');
    }
    for (const name of ['search_articles', 'fetch_x_post', 'search_x_posts']) {
      expect(readAgentUntrustedContentSource(name), name).toBe('internal');
    }
  });

  it('only sends externally authored sources to the gate', () => {
    expect(isAgentUntrustedContentSource('internal')).toBe(false);
    expect(isAgentUntrustedContentSource('web_fetch')).toBe(true);
    expect(isAgentUntrustedContentSource('connector')).toBe(true);
    expect(isAgentUntrustedContentSource('user_upload')).toBe(true);
  });
});

it('retains registry validity for every shared mapped name', () => {
  for (const name of [
    ...WEB_FETCH_TOOLS,
    ...CONNECTOR_TOOLS,
    ...USER_UPLOAD_TOOLS,
  ])
    expect(getToolByName(name), name).toBeDefined();
  expect(parseAgentUntrustedContentOrigin(null)).toBe('agent');
  expect(parseAgentUntrustedContentOrigin('spoofed')).toBe('agent');
  expect(parseAgentUntrustedContentOrigin('mcp')).toBe('mcp');
});
