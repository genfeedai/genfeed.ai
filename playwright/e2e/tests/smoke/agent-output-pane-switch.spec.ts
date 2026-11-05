import { expect, type Page, test } from '@playwright/test';
import { showAgentPane, showOutputPane } from '../../utils/agent-output-layout';

/**
 * A narrow agent/output layout whose view switch ignores its first click, the
 * way a click that lands before hydration is dropped after a reload.
 */
async function mountLayoutDroppingFirstClick(
  page: Page,
  view: 'Agent' | 'Output',
): Promise<void> {
  await page.setContent(`
    <div data-testid="agent-output-layout">
      <div role="button" tabindex="0" id="views" aria-haspopup="menu">View: ${view}</div>
      <div role="menu" id="menu" hidden>
        <div role="menuitemradio" aria-checked="${view === 'Agent'}" data-view="Agent">Agent</div>
        <div role="menuitemradio" aria-checked="${view === 'Output'}" data-view="Output">Output</div>
      </div>
      <section data-testid="agent-output-agent-pane" ${view === 'Agent' ? '' : 'hidden'}>Agent</section>
      <section data-testid="agent-output-output-pane" ${view === 'Output' ? '' : 'hidden'}>Output</section>
    </div>
    <script>
      const views = document.getElementById('views');
      const menu = document.getElementById('menu');
      let isHydrated = false;
      views.addEventListener('click', () => {
        if (!isHydrated) {
          isHydrated = true;
          return;
        }
        menu.hidden = false;
      });
      for (const item of menu.querySelectorAll('[role=menuitemradio]')) {
        item.addEventListener('click', () => {
          const next = item.dataset.view;
          views.textContent = 'View: ' + next;
          document.querySelector('[data-testid=agent-output-agent-pane]').hidden = next !== 'Agent';
          document.querySelector('[data-testid=agent-output-output-pane]').hidden = next !== 'Output';
          menu.hidden = true;
        });
      }
    </script>
  `);
}

test.describe('agent/output pane switch', () => {
  test('reaches Output when the first view-menu click is dropped', async ({
    page,
  }) => {
    await mountLayoutDroppingFirstClick(page, 'Agent');

    const output = await showOutputPane(page);

    await expect(output).toBeVisible();
    await expect(page.getByTestId('agent-output-agent-pane')).toBeHidden();
  });

  test('reaches Agent when the first view-menu click is dropped', async ({
    page,
  }) => {
    await mountLayoutDroppingFirstClick(page, 'Output');

    const agent = await showAgentPane(page);

    await expect(agent).toBeVisible();
    await expect(page.getByTestId('agent-output-output-pane')).toBeHidden();
  });
});
