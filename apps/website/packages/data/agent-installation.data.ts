import type { AgentInstallation } from '@genfeedai/contracts/interfaces/website/agent-installation.interface';

const repository = 'https://github.com/genfeedai/agent';
const connector =
  'In Claude, open Customize → Connectors → + Add → Add custom connector. Name it Genfeed, paste the URL below and approve browser sign-in. If Add is unavailable, ask your workspace owner. Create media in Genfeed Studio.';

export const agentInstallations = {
  chatgpt: {
    destination: 'https://chatgpt.com/plugins',
    destinationLabel: 'Open ChatGPT',
    instruction:
      'In ChatGPT on the web, open Settings → Apps and enable Developer mode where your account or workspace allows it. Choose Create, name the app Genfeed, paste the connector URL below and select OAuth. Full read/write MCP access requires Business or Enterprise/Edu and workspace permission; Pro supports read/fetch. If Create is unavailable, ask your workspace admin. Genfeed is not yet listed in the public directory.',
    label: 'Connect to ChatGPT',
    method: 'Custom ChatGPT app',
  },
  claude: {
    destination: 'https://claude.ai/customize/connectors',
    destinationLabel: 'Open Claude Customize',
    instruction: connector,
    label: 'Add to Claude',
    method: 'Claude connector',
  },
  'claude-code': {
    command: '/plugin install genfeed --marketplace genfeedai/agent',
    instruction:
      'In Claude Code 2.1.275 or newer, paste this command to install Genfeed and its playbook. On older versions, run /plugin marketplace add genfeedai/agent, then /plugin install genfeed@genfeed. Open /mcp, select Genfeed, and complete browser sign-in.',
    label: 'Install in Claude Code',
    method: 'Claude Code plugin',
  },
  'claude-cowork': {
    destination: 'https://claude.ai/customize/connectors',
    destinationLabel: 'Open Claude Customize',
    instruction: `${connector} Then enable Genfeed in your Cowork task.`,
    label: 'Add to Cowork',
    method: 'Cowork connector',
  },
  codex: {
    command: 'codex plugin marketplace add genfeedai/agent',
    instruction:
      'Run this command to register the Genfeed plugin source. Refresh or restart Codex, open Plugins, select the Genfeed source, and install Genfeed. Registration alone does not install the plugin. Complete OAuth when prompted.',
    label: 'Install in Codex',
    method: 'Codex plugin',
  },
  cursor: {
    destinationLabel: 'Add Genfeed to Cursor',
    instruction:
      'Open the install link, confirm the Genfeed MCP server in Cursor, and sign in with Genfeed OAuth. This installs the connector; the packaged playbook is available separately in the agent repository.',
    label: 'Add to Cursor',
    method: 'Native Cursor install',
  },
  gemini: {
    command: `gemini extensions install ${repository}`,
    instruction:
      'Run this command in Gemini CLI to install the Genfeed extension, including its playbook and MCP connector. Complete authentication in the client. This setup is for Gemini CLI, not the Gemini web app.',
    label: 'Install in Gemini CLI',
    method: 'Gemini CLI extension',
  },
  grok: {
    destination: 'https://grok.com/connectors',
    destinationLabel: 'Open Grok connectors',
    instruction:
      'Open Grok Connectors, choose New Connector → Custom, paste the Genfeed MCP URL, and complete OAuth.',
    label: 'Add to Grok',
    method: 'Grok connector',
  },
  'grok-bot': {
    instruction:
      'Paste the connection prompt below into your Grok Bot chat, then approve the Genfeed sign-in link in your browser.',
    label: 'Connect Grok Bot',
    method: 'Connect from chat',
  },
  muse: {
    instruction:
      'Paste the connection prompt below into Meta Muse, then approve the Genfeed sign-in link in your browser.',
    label: 'Connect Meta Muse',
    method: 'Connect from chat',
  },
  openclaw: {
    command: 'npx skills add genfeedai/agent',
    instruction:
      'Install the Genfeed playbook with this command, then configure the hosted MCP connector in your OpenClaw runtime using the URL below. Skill installation alone does not connect or authenticate Genfeed.',
    label: 'Set up OpenClaw',
    method: 'Playbook + connector',
  },
} satisfies Record<string, AgentInstallation>;

export function buildCursorInstallUrl(url: string): string {
  const config = btoa(JSON.stringify({ url }));
  return `https://cursor.com/link/mcp/install?name=genfeed&config=${encodeURIComponent(config)}`;
}
