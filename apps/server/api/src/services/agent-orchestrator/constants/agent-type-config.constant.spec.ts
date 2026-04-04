import { AgentType } from '@genfeedai/enums';
import {
  AGENT_TYPE_CONFIGS,
  detectPlatformIntentSuffix,
  getAgentTypeConfig,
} from './agent-type-config.constant';

describe('getAgentTypeConfig', () => {
  it('returns config for a known agent type', () => {
    const config = getAgentTypeConfig(AgentType.X_CONTENT);
    expect(config.systemPromptSuffix).toContain('X/Twitter');
  });

  it('falls back to GENERAL for unknown agent type', () => {
    const config = getAgentTypeConfig('unknown' as AgentType);
    expect(config).toBe(AGENT_TYPE_CONFIGS[AgentType.GENERAL]);
  });
});

describe('detectPlatformIntentSuffix', () => {
  it('returns LinkedIn suffix when message mentions linkedin', () => {
    const suffix = detectPlatformIntentSuffix(
      'Write me a LinkedIn post about AI trends',
    );
    expect(suffix).toContain('LinkedIn Content Agent');
    expect(suffix).toContain('150-300 words');
  });

  it('returns X/Twitter suffix when message mentions tweet', () => {
    const suffix = detectPlatformIntentSuffix(
      'Draft a tweet about our new product launch',
    );
    expect(suffix).toContain('X/Twitter Content Agent');
    expect(suffix).toContain('280 characters');
  });

  it('returns X/Twitter suffix for "post on X"', () => {
    const suffix = detectPlatformIntentSuffix(
      'Write a post on X about our partnership',
    );
    expect(suffix).toContain('X/Twitter Content Agent');
  });

  it('returns X/Twitter suffix for "x thread"', () => {
    const suffix = detectPlatformIntentSuffix('Create an x thread about SEO');
    expect(suffix).toContain('X/Twitter Content Agent');
  });

  it('returns Short-Form suffix when message mentions TikTok', () => {
    const suffix = detectPlatformIntentSuffix(
      'Write a TikTok caption for this video',
    );
    expect(suffix).toContain('Short-Form Writer Agent');
    expect(suffix).toContain('TikTok');
  });

  it('returns Short-Form suffix when message mentions Instagram Reels', () => {
    const suffix = detectPlatformIntentSuffix(
      'Create a caption for my Instagram reel',
    );
    expect(suffix).toContain('Short-Form Writer Agent');
  });

  it('returns YouTube suffix when message mentions YouTube', () => {
    const suffix = detectPlatformIntentSuffix(
      'Write a YouTube video script about cooking',
    );
    expect(suffix).toContain('YouTube Script Agent');
  });

  it('returns empty string when no platform is detected', () => {
    const suffix = detectPlatformIntentSuffix(
      'Help me brainstorm content ideas',
    );
    expect(suffix).toBe('');
  });

  it('returns empty string for empty content', () => {
    expect(detectPlatformIntentSuffix('')).toBe('');
  });

  it('is case-insensitive', () => {
    const suffix = detectPlatformIntentSuffix(
      'Write a LINKEDIN post about leadership',
    );
    expect(suffix).toContain('LinkedIn Content Agent');
  });

  it('prioritizes LinkedIn over other matches in the same message', () => {
    const suffix = detectPlatformIntentSuffix(
      'Adapt this LinkedIn post for Twitter too',
    );
    expect(suffix).toContain('LinkedIn Content Agent');
  });
});
