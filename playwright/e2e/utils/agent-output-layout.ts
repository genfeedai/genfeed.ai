import { expect, type Locator, type Page } from '@playwright/test';

/**
 * One attempt at the Agent / Output switch. A trigger click dropped before
 * hydration leaves the menu closed; a short step timeout fails that attempt
 * fast so `toPass` can try again, instead of one click spending the whole
 * retry deadline at the default action timeout.
 */
const PANE_MENU_STEP_TIMEOUT_MS = 2_000;

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
export async function expectOpenProjectLayout(page: Page): Promise<void> {
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
  expect(Math.abs(agentBox.width - outputBox.width)).toBeLessThanOrEqual(2);

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

/**
 * Below xl the layout shows one pane at a time through a view dropdown and
 * opens on the agent, so a spec that reads the output (generations, projects,
 * a board) switches to it first. At xl and above both panes show and this
 * only returns the output pane.
 */
export async function showOutputPane(page: Page): Promise<Locator> {
  // The page being left can stay mounted but hidden, so only the visible
  // layout counts.
  const layout = page
    .getByTestId('agent-output-layout')
    .filter({ visible: true });
  const output = layout.getByTestId('agent-output-output-pane');
  const views = layout.getByRole('button', {
    exact: true,
    name: 'View: Agent',
  });
  // After a reload, or while a new page opens, the layout is not settled yet,
  // so isVisible() alone would skip the Output choice on a narrow viewport.
  await expect(layout).toHaveCount(1);
  if (await views.isVisible())
    // A click that lands before hydration after a reload is dropped, so retry
    // until the output pane is actually showing.
    await expect(async () => {
      await views.click({ timeout: PANE_MENU_STEP_TIMEOUT_MS });
      await page
        .getByRole('menuitemradio', { exact: true, name: 'Output' })
        .click({ timeout: PANE_MENU_STEP_TIMEOUT_MS });
      await expect(output).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  await expect(output).toBeVisible();
  return output;
}

/**
 * The counterpart of `showOutputPane`: below xl, switch back to the agent so
 * its prompt bar is on screen. At xl and above both panes show and this only
 * returns the agent pane.
 */
export async function showAgentPane(page: Page): Promise<Locator> {
  const layout = page
    .getByTestId('agent-output-layout')
    .filter({ visible: true });
  const agent = layout.getByTestId('agent-output-agent-pane');
  const views = layout.getByRole('button', {
    exact: true,
    name: 'View: Output',
  });
  await expect(layout).toHaveCount(1);
  if (await views.isVisible())
    await expect(async () => {
      await views.click({ timeout: PANE_MENU_STEP_TIMEOUT_MS });
      await page
        .getByRole('menuitemradio', { exact: true, name: 'Agent' })
        .click({ timeout: PANE_MENU_STEP_TIMEOUT_MS });
      await expect(agent).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  await expect(agent).toBeVisible();
  return agent;
}
