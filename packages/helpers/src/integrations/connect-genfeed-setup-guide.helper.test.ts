import { buildConnectGenfeedChatPrompt } from './connect-genfeed.helper';
import { CONNECT_CLIENTS } from './connect-genfeed-clients.helper';
import {
  buildConnectSetupGuide,
  splitConnectSetupText,
} from './connect-genfeed-setup-guide.helper';

const URLS = {
  connectUrl: 'https://app.genfeed.ai/connectors',
  mcpUrl: 'https://mcp.genfeed.ai/mcp',
};

describe('buildConnectSetupGuide', () => {
  it.each(CONNECT_CLIENTS.map((entry) => entry.id))(
    'gives %s numbered steps with unique copy ids',
    (id) => {
      const guide = buildConnectSetupGuide(id, URLS);
      const ids = guide.steps.flatMap((step) =>
        step.parts.flatMap((part) =>
          part.kind === 'command' ? [part.id] : [],
        ),
      );

      expect(guide.steps.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it('gives Grok and Meta Muse the same pasted prompt under their own names', () => {
    const grok = buildConnectSetupGuide('grok', URLS);
    const muse = buildConnectSetupGuide('meta-muse', URLS);

    expect(grok.title).toBe('Grok');
    expect(muse.title).toBe('Meta Muse');
    expect(grok.steps[0]?.parts[1]).toMatchObject({
      id: 'grok-prompt',
      label: 'Copy Grok prompt',
      text: buildConnectGenfeedChatPrompt(URLS.mcpUrl),
    });
    expect(muse.steps[0]?.parts[1]).toMatchObject({
      id: 'meta-muse-prompt',
      text: buildConnectGenfeedChatPrompt(URLS.mcpUrl),
    });
  });

  it('puts the MCP URL in the Claude Code command', () => {
    expect(
      buildConnectSetupGuide('claude-code', URLS).steps[0]?.parts[1],
    ).toMatchObject({
      text: 'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
    });
  });
});

describe('splitConnectSetupText', () => {
  it('marks the text between backticks as code', () => {
    expect(splitConnectSetupText('Open `/mcp` in Claude Code.')).toEqual([
      { isCode: false, offset: 0, text: 'Open ' },
      { isCode: true, offset: 6, text: '/mcp' },
      { isCode: false, offset: 11, text: ' in Claude Code.' },
    ]);
  });
});
