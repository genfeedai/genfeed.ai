import {
  buildDesktopCliAgentSystemPrompt,
  GENFEED_BRAND_CONTEXT_TOOL,
} from '../../apps/desktop/app/src/main/cli-agent-runtime.constants';

// Render the production prompt rather than evaluating TypeScript source text.
export function desktopMcpReferenceSources() {
  return [
    ...['Claude Code', 'Codex'].flatMap((runtimeLabel) =>
      ['fixture-brand', null].map((brandId) => ({
        path: 'apps/desktop/app/src/main/cli-agent-runtime.constants.ts',
        text: buildDesktopCliAgentSystemPrompt({
          brandId,
          organizationId: 'fixture-organization',
          runtimeLabel,
          threadId: 'fixture-thread',
        }),
      })),
    ),
    {
      path: 'apps/desktop/app/src/main/cli-agent-runtime.constants.ts',
      text: `Call the tool \`${GENFEED_BRAND_CONTEXT_TOOL}\`.`,
    },
  ];
}
if (import.meta.main) console.log(JSON.stringify(desktopMcpReferenceSources()));
