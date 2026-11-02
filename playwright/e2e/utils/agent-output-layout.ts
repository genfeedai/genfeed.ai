import { expect, type Page } from '@playwright/test';

/** `rail` keeps the agent a narrow column (22.5rem) beside a wide tool surface. */
type OpenProjectLayoutMode = 'rail' | 'split';

const RAIL_AGENT_WIDTH_PX = 360;
/** The prompt bar is the last thing in the agent column, plus a small gutter. */
const PROMPT_BAR_BOTTOM_GAP_PX = 160;

/**
 * An open project in a creative app (Turbo, Clipper, Motion, Editor,
 * Storyboard) shares one layout: the agent conversation on the left with its
 * prompt bar at the bottom of that column, the project on the right, and no
 * second agent dock.
 *
 * Call at a desktop viewport (1440 wide). Below `xl` the two panes collapse
 * into an Agent / Output switch.
 */
export async function expectOpenProjectLayout(
  page: Page,
  { mode = 'split' }: { mode?: OpenProjectLayoutMode } = {},
): Promise<void> {
  const agent = page.getByTestId('agent-output-agent-pane');
  const output = page.getByTestId('agent-output-output-pane');
  await expect(agent).toBeVisible();
  await expect(output).toBeVisible();

  const [agentBox, outputBox] = await Promise.all([
    agent.boundingBox(),
    output.boundingBox(),
  ]);
  if (!agentBox || !outputBox) {
    throw new Error('Agent and output panes must both be laid out.');
  }
  expect(agentBox.x).toBeLessThan(outputBox.x);
  if (mode === 'rail') {
    expect(Math.abs(agentBox.width - RAIL_AGENT_WIDTH_PX)).toBeLessThanOrEqual(
      2,
    );
  } else {
    expect(Math.abs(agentBox.width - outputBox.width)).toBeLessThanOrEqual(2);
  }

  // One agent: the product dock stays off beside the page's own conversation.
  await expect(page.getByTestId('topbar-agent-dock-toggle')).toHaveCount(0);
  await expect(page.getByTestId('agent-dock')).toHaveCount(0);

  // The prompt bar belongs to the agent column and sits at its bottom.
  // Its mode picker is the prompt bar's own control, so it stands in for the bar.
  const promptBar = agent.getByRole('button', { name: /^Agent mode:/ });
  await expect(promptBar).toBeVisible();
  const promptBox = await promptBar.boundingBox();
  if (!promptBox) {
    throw new Error('The prompt bar must be laid out.');
  }
  expect(
    agentBox.y + agentBox.height - (promptBox.y + promptBox.height),
  ).toBeLessThanOrEqual(PROMPT_BAR_BOTTOM_GAP_PX);
  expect(promptBox.y).toBeGreaterThan(agentBox.y + agentBox.height / 2);
}
