import PromptEditorView from '@ui/prompt-editor/PromptEditorView';
import { Profiler } from 'react';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

it('keeps wrapped multiline typing visible without rerendering the editor on each character', async () => {
  const onRender = vi.fn();
  const view = await render(
    <Profiler id="prompt" onRender={onRender}>
      <div style={{ width: 240 }}>
        <PromptEditorView initialContent="First line" />
      </div>
    </Profiler>,
  );
  const textbox = page.getByRole('textbox', { name: 'Prompt' });
  await textbox.click();
  const element = view.container.querySelector('[contenteditable="true"]');
  if (!(element instanceof HTMLElement))
    throw new Error('Missing prompt editor');
  // Match the production cap without loading the app's full stylesheet.
  Object.assign(element.style, {
    maxHeight: '112px',
    overflowY: 'auto',
    lineHeight: '24px',
  });
  await userEvent.keyboard('{End}');
  onRender.mockClear();
  for (let i = 0; i < 12; i += 1) {
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.keyboard(
      'A long line that wraps while typing in this narrow prompt',
    );
  }
  await expect
    .poll(() => element.scrollHeight - element.scrollTop - element.clientHeight)
    .toBeLessThanOrEqual(2);
  expect(element.scrollTop).toBeGreaterThan(0);
  expect(onRender.mock.calls.length).toBeLessThan(12);
  // Editing an earlier line follows that caret instead of snapping to the tail.
  await userEvent.keyboard(
    navigator.platform.includes('Mac')
      ? '{Meta>}{ArrowUp}{/Meta}'
      : '{Control>}{Home}{/Control}',
  );
  await userEvent.keyboard('Edited ');
  await expect.poll(() => element.scrollTop).toBeLessThan(30);
});
