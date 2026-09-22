import {
  isAgentUntrustedContentSource,
  readAgentUntrustedContentSource,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content-source.util';
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

  it('only sends externally authored sources to the gate', () => {
    expect(isAgentUntrustedContentSource('internal')).toBe(false);
    expect(isAgentUntrustedContentSource('web_fetch')).toBe(true);
    expect(isAgentUntrustedContentSource('connector')).toBe(true);
    expect(isAgentUntrustedContentSource('user_upload')).toBe(true);
  });
});
