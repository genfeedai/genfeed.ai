import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: function MockLink(props: {
    children?: ReactNode;
    className?: string;
    href: string;
  }) {
    return (
      <a className={props.className} data-testid="app-link" href={props.href}>
        {props.children}
      </a>
    );
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockButton(props: {
    asChild?: boolean;
    children?: ReactNode;
    onClick?: () => void;
  }) {
    // asChild renders the anchor itself — mirror that so href CTAs stay links.
    if (props.asChild) {
      return <>{props.children}</>;
    }

    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { NextStepsCard } from './NextStepsCard';

function buildAction(overrides: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'next-steps-1',
    nextSteps: [
      {
        ctas: [{ href: '/settings/brands', label: 'Open brand settings' }],
        id: 'next-step-1-brand_settings',
        title: 'Brand setup',
      },
    ],
    title: 'What would you like to do?',
    type: 'next_steps_card',
    ...overrides,
  };
}

describe('NextStepsCard', () => {
  it('renders every offered step as a control, not prose', () => {
    render(
      <NextStepsCard
        action={buildAction({
          nextSteps: [
            {
              ctas: [{ href: '/settings/social', label: 'Open connections' }],
              id: 'step-1',
              title: 'Connect a social account',
            },
            {
              ctas: [
                { href: '/settings/brands', label: 'Open brand settings' },
              ],
              id: 'step-2',
              title: 'Brand setup',
            },
            {
              ctas: [{ href: '/settings', label: 'Open settings' }],
              id: 'step-3',
              title: 'Default settings',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Brand setup')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Open brand settings/ }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open connections/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open settings/ })).toBeTruthy();
  });

  it('points a navigation CTA at the owning page through the application Link', () => {
    render(<NextStepsCard action={buildAction()} />);

    const link = screen.getByRole('link', { name: /Open brand settings/ });
    expect(link.getAttribute('href')).toBe('/settings/brands');
    // Raw anchors bypass client-side routing — navigation must render via the
    // application Link component (next/link).
    expect(link.getAttribute('data-testid')).toBe('app-link');
  });

  it('sends the follow-up prompt back into the conversation', () => {
    const onUiAction = vi.fn();

    render(
      <NextStepsCard
        action={buildAction({
          nextSteps: [
            {
              ctas: [
                {
                  action: 'send_prompt',
                  label: 'Continue here',
                  payload: { prompt: 'Walk me through brand setup.' },
                },
              ],
              id: 'step-inline',
              title: 'Brand setup',
            },
          ],
        })}
        onUiAction={onUiAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue here' }));

    expect(onUiAction).toHaveBeenCalledWith('send_prompt', {
      prompt: 'Walk me through brand setup.',
    });
  });

  it('renders nothing when the card carries no steps', () => {
    const { container } = render(
      <NextStepsCard action={buildAction({ nextSteps: [] })} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
