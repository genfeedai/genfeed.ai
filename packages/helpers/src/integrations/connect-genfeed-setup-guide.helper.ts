import {
  buildConnectGenfeedChatPrompt,
  buildConnectGenfeedInstructions,
  buildGenfeedAgentSetupPrompt,
  GENFEED_SKILLS_INSTALL_COMMAND,
} from './connect-genfeed.helper';
import type { ConnectClientTabId } from './connect-genfeed-clients.helper';

/** A paragraph; text between backticks is inline code. */
export interface ConnectSetupText {
  kind: 'text';
  text: string;
}

/** A command or prompt the reader copies. */
export interface ConnectSetupCommand {
  /** Stable element id: the MCP setup page's copy script reads it. */
  id: string;
  isMultiline: boolean;
  kind: 'command';
  /** Accessible name of the copy button. */
  label: string;
  text: string;
}

export type ConnectSetupPart = ConnectSetupCommand | ConnectSetupText;

export interface ConnectSetupStep {
  parts: readonly ConnectSetupPart[];
  title: string;
}

export interface ConnectSetupGuide {
  badge: string | null;
  steps: readonly ConnectSetupStep[];
  title: string;
}

export interface ConnectSetupGuideUrls {
  /** The app page an agent sends the reader to for an API key. */
  connectUrl: string;
  mcpUrl: string;
}

export interface ConnectSetupTextSegment {
  isCode: boolean;
  /** Where the segment starts in the paragraph, so it doubles as a list key. */
  offset: number;
  text: string;
}

const text = (value: string): ConnectSetupText => ({
  kind: 'text',
  text: value,
});

const command = (
  id: string,
  label: string,
  value: string,
  isMultiline = false,
): ConnectSetupCommand => ({
  id,
  isMultiline,
  kind: 'command',
  label,
  text: value,
});

const chatAgentGuide = (
  id: 'grok' | 'meta-muse',
  label: string,
  mcpUrl: string,
): ConnectSetupGuide => ({
  badge: 'Chat-built connector',
  steps: [
    {
      parts: [
        text(`${label} builds its own MCP connector from this chat prompt.`),
        command(
          `${id}-prompt`,
          `Copy ${label} prompt`,
          buildConnectGenfeedChatPrompt(mcpUrl),
          true,
        ),
      ],
      title: 'Paste this prompt',
    },
    {
      parts: [
        text(
          'Approve the sign-in link it sends back. Never share a password, token, or API key in the chat.',
        ),
      ],
      title: 'Approve in your browser',
    },
  ],
  title: label,
});

/**
 * The setup steps for one client, as the MCP setup page and the in-app
 * Connectors page both show them. Both render this, so the two never differ.
 */
export function buildConnectSetupGuide(
  id: ConnectClientTabId,
  { connectUrl, mcpUrl }: ConnectSetupGuideUrls,
): ConnectSetupGuide {
  switch (id) {
    case 'claude-code':
      return {
        badge: 'HTTP transport',
        steps: [
          {
            parts: [
              text('Registers Genfeed in user scope with browser OAuth.'),
              command(
                'claude-code-command',
                'Copy Claude Code command',
                buildConnectGenfeedInstructions('claude-code', mcpUrl)
                  .primaryCommand ?? '',
              ),
            ],
            title: 'Add the MCP server',
          },
          {
            parts: [
              text(
                'Open `/mcp` in Claude Code, select genfeed, and sign in. Then ask it to list your Genfeed brands.',
              ),
            ],
            title: 'Authorize and verify',
          },
        ],
        title: 'Claude Code',
      };
    case 'claude-chat':
      return {
        badge: 'Custom connector',
        steps: [
          {
            parts: [
              text('Add a custom connector in Claude with this URL.'),
              command('claude-chat-url', 'Copy Genfeed MCP URL', mcpUrl),
            ],
            title: 'Add the connector',
          },
          {
            parts: [
              text(
                'Complete browser OAuth, then ask Claude to list your Genfeed brands.',
              ),
            ],
            title: 'Authorize and verify',
          },
        ],
        title: 'Claude & Cowork',
      };
    case 'codex':
      return {
        badge: null,
        steps: [
          {
            parts: [
              text(
                'The CLI and IDE share `~/.codex/config.toml`. No bearer-token variable needed.',
              ),
              command(
                'codex-command',
                'Copy Codex command',
                buildConnectGenfeedInstructions('codex', mcpUrl)
                  .primaryCommand ?? '',
              ),
            ],
            title: 'Add the MCP server',
          },
          {
            parts: [
              text(
                'Sign in and approve access in your browser. If the browser did not open during setup, run this command to start authorization.',
              ),
              command(
                'codex-login-command',
                'Copy Codex login command',
                'codex mcp login genfeed',
              ),
              text(
                'After approval, expect a Codex tab at `127.0.0.1` (localhost). You can close that tab. Return to Codex and ask it to list your Genfeed brands.',
              ),
            ],
            title: 'Authorize and verify',
          },
        ],
        title: 'Codex',
      };
    case 'grok':
      return chatAgentGuide('grok', 'Grok', mcpUrl);
    case 'meta-muse':
      return chatAgentGuide('meta-muse', 'Meta Muse', mcpUrl);
    case 'other-clients': {
      const generic = buildConnectGenfeedInstructions('generic', mcpUrl);
      return {
        badge: 'ChatGPT, Cursor, Gemini',
        steps: [
          {
            parts: [
              text("Paste this into your client's remote MCP server settings."),
              command(
                'generic-client-config',
                'Copy client configuration',
                generic.configuration,
                true,
              ),
            ],
            title: 'Add this server configuration',
          },
          {
            parts: [
              text(
                `${generic.authorizationInstruction} Then ask your agent to list your Genfeed brands.`,
              ),
            ],
            title: 'Authorize and verify',
          },
        ],
        title: 'Other MCP clients',
      };
    }
    case 'agent-prompt':
      return {
        badge: 'Copy/paste',
        steps: [
          {
            parts: [
              text(
                'Drop this into Claude Code, Codex, or another local agent with shell access. It configures Genfeed for your selected client (and installs the playbook where the client supports it), starts browser authorization, and verifies access with read-only calls.',
              ),
              text(
                'For non-Claude clients only, run this command and select your client. Skip it if a Genfeed plugin already includes the playbook. Claude clients connect with OAuth. Do not install this skills bundle into any Claude client. Skills alone do not connect or authenticate MCP.',
              ),
              command(
                'skills-install-command',
                'Copy skills install command',
                GENFEED_SKILLS_INSTALL_COMMAND,
              ),
              command(
                'agent-setup-prompt',
                'Copy agent setup prompt',
                `${buildGenfeedAgentSetupPrompt(mcpUrl)}

Guided connection flow: ${connectUrl}
For the Genfeed CLI, only if requested separately, run genfeed login with no flags. The human approves in the browser. Do not paste a secret into this chat.`,
                true,
              ),
            ],
            title: 'Give this to a local shell agent',
          },
          {
            parts: [
              text(
                'You approve access yourself. Copying this prompt does not authorize your client.',
              ),
            ],
            title: 'Complete sign-in in your browser',
          },
        ],
        title: 'AI agent setup prompt',
      };
  }
}

/** Splits a guide paragraph into plain text and the inline code between backticks. */
export function splitConnectSetupText(
  value: string,
): ConnectSetupTextSegment[] {
  const segments: ConnectSetupTextSegment[] = [];
  let offset = 0;
  value.split('`').forEach((segment, index) => {
    if (segment.length > 0) {
      segments.push({ isCode: index % 2 === 1, offset, text: segment });
    }
    offset += segment.length + 1;
  });
  return segments;
}
