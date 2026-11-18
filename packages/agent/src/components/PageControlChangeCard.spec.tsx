import { PageControlChangeCard } from '@genfeedai/agent/components/PageControlChangeCard';
import type { AgentUiActionOf } from '@genfeedai/agent/models/agent-chat.model';
import {
  type PageControlsBridge,
  type PageControlsBridgeComponent,
  registerPageControlsBridge,
} from '@genfeedai/agent/utils/page-controls.bridge';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

const CARD: AgentUiActionOf<'page_control_change_card'> = {
  description: 'Stop the weekly recap.',
  id: 'page-control-change-1',
  steps: [
    { action: 'setChecked', label: 'Weekly recap', value: false },
    { action: 'setChecked', label: 'Agent Emails', value: true },
  ],
  title: 'Change 2 settings on this page',
  type: 'page_control_change_card',
};

/** A page with named switches; a change flips the state and reports itself. */
function createPage(
  components: PageControlsBridgeComponent[],
): PageControlsBridge {
  return {
    act: async ({ steps }) => {
      const [step] = steps;
      const target = components.find((component) => component.ref === step.ref);
      const next = step.args?.[0];
      const isChange = target !== undefined && target.checked !== next;
      if (target) {
        target.checked = next;
      }
      return {
        ok: true,
        steps: [
          {
            changes: isChange ? [{ key: 'checked' }] : [],
            ref: step.ref,
            step: 0,
          },
        ],
      };
    },
    snapshot: () => components,
  };
}

function switchControl(
  ref: string,
  label: string,
  isChecked: boolean,
  extra: Partial<PageControlsBridgeComponent> = {},
): PageControlsBridgeComponent {
  return {
    actions: ['setChecked'],
    checked: isChecked,
    component: 'switch',
    label,
    ref,
    ...extra,
  };
}

describe('PageControlChangeCard', () => {
  afterEach(() => registerPageControlsBridge(null));

  it('lists the proposed changes and changes nothing until approved', () => {
    const components = [
      switchControl('c1', 'Weekly recap', true),
      switchControl('c2', 'Agent Emails', false),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);

    expect(screen.getByText('Turn off Weekly recap')).toBeInTheDocument();
    expect(screen.getByText('Turn on Agent Emails')).toBeInTheDocument();
    expect(components.map((component) => component.checked)).toEqual([
      true,
      false,
    ]);
  });

  it('applies every step on approval and reports each result', async () => {
    const components = [
      switchControl('c1', 'Weekly recap', true),
      switchControl('c2', 'Agent Emails', true),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );

    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    expect(components.map((component) => component.checked)).toEqual([
      false,
      true,
    ]);
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(
      screen.getByText('Already set, nothing to change'),
    ).toBeInTheDocument();
  });

  it('puts the changes back when the person undoes them', async () => {
    const components = [
      switchControl('c1', 'Weekly recap', true),
      switchControl('c2', 'Agent Emails', false),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Changes undone')).toBeInTheDocument();
    expect(components.map((component) => component.checked)).toEqual([
      true,
      false,
    ]);
    expect(screen.getAllByText('Put back')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('leaves a control the person changed after the agent did', async () => {
    const components = [
      switchControl('c1', 'Weekly recap', true),
      switchControl('c2', 'Agent Emails', false),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );
    // The person turns Weekly recap back on by hand before undoing.
    components[0].checked = true;
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText('You changed this since, so it stays as it is.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Put back')).toBeInTheDocument();
    expect(components.map((component) => component.checked)).toEqual([
      true,
      false,
    ]);
  });

  it('offers no undo when nothing was changed', async () => {
    const components = [
      switchControl('c1', 'Weekly recap', false),
      switchControl('c2', 'Agent Emails', true),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );

    await screen.findByText('Done');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('says what it could not change and offers another try', async () => {
    const components = [
      switchControl('c1', 'Weekly recap', true, {
        confirm: 'Charges your card',
      }),
    ];
    registerPageControlsBridge(createPage(components));

    render(<PageControlChangeCard action={CARD} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );

    expect(
      await screen.findByText(
        'Needs you: Charges your card. Change it yourself.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This control is not on the page you are on. Open its page first.',
      ),
    ).toBeInTheDocument();
    expect(components[0].checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('cannot be applied in an archived thread', () => {
    registerPageControlsBridge(createPage([]));

    render(<PageControlChangeCard action={CARD} isInert />);

    expect(
      screen.getByRole('button', { name: 'Apply changes' }),
    ).toBeDisabled();
  });
});
