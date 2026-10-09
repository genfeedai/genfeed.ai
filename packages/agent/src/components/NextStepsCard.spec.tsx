import { ButtonVariant } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeScope = vi.hoisted(() => ({ orgSlug: '', brandSlug: '' }));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => routeScope,
}));
beforeEach(() => {
  routeScope.orgSlug = '';
  routeScope.brandSlug = '';
});

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
    variant?: ButtonVariant;
  }) {
    // asChild renders the anchor itself — mirror that so href CTAs stay links.
    if (props.asChild) {
      return <>{props.children}</>;
    }

    return (
      <button
        type="button"
        data-variant={props.variant}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { NextStepsCard } from './NextStepsCard';

function renderCard(ui: ReactElement) {
  return render(ui);
}

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
    renderCard(
      <NextStepsCard
        action={buildAction({
          nextSteps: [
            {
              ctas: [
                {
                  href: '/settings/connected-accounts',
                  label: 'Open connections',
                },
              ],
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
    renderCard(<NextStepsCard action={buildAction()} />);

    const link = screen.getByRole('link', { name: /Open brand settings/ });
    expect(link.getAttribute('href')).toBe('/settings/brands');
    // Raw anchors bypass client-side routing — navigation must render via the
    // application Link component (next/link).
    expect(link.getAttribute('data-testid')).toBe('app-link');
  });

  it('sends the follow-up prompt back into the conversation', () => {
    const onUiAction = vi.fn();

    renderCard(
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

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(onUiAction).toHaveBeenCalledWith('send_prompt', {
      prompt: 'Walk me through brand setup.',
    });
  });

  it('promotes Start ahead of saved navigation CTAs without changing prompts or links', () => {
    const onUiAction = vi.fn();
    const action = buildAction({
      nextSteps: [
        {
          id: 'saved-step',
          title: 'Brand setup',
          ctas: [
            { href: '/settings/brands', label: 'Open brand settings' },
            {
              action: 'send_prompt',
              label: 'Do it here',
              payload: { prompt: 'Walk me through brand setup.' },
            },
            { href: '/publishing/review', label: 'Open reviews' },
          ],
        },
      ],
    });
    renderCard(<NextStepsCard action={action} onUiAction={onUiAction} />);
    const start = screen.getByRole('button', { name: 'Start' });
    const brandSettings = screen.getByRole('link', {
      name: /Open brand settings/,
    });
    const reviews = screen.getByRole('link', { name: /Open reviews/ });
    expect(
      start.compareDocumentPosition(brandSettings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      brandSettings.compareDocumentPosition(reviews) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(start.getAttribute('data-variant')).toBe(ButtonVariant.DEFAULT);
    expect(brandSettings.getAttribute('href')).toBe('/settings/brands');
    expect(reviews.getAttribute('href')).toBe('/publishing/review');
    expect(screen.queryByText('Do it here')).toBeNull();
    fireEvent.click(start);
    expect(onUiAction).toHaveBeenCalledOnce();
    expect(onUiAction).toHaveBeenCalledWith('send_prompt', {
      prompt: 'Walk me through brand setup.',
    });
    expect(action.nextSteps?.[0]?.ctas[0]?.label).toBe('Open brand settings');
  });

  it('repairs a saved organization-only Connections link using the current brand route', () => {
    routeScope.orgSlug = 'acme';
    routeScope.brandSlug = 'launch';
    renderCard(
      <NextStepsCard
        action={buildAction({
          nextSteps: [
            {
              id: 'connect',
              title: 'Connect social accounts',
              ctas: [
                {
                  href: '/acme/~/settings/connected-accounts?platform=x#accounts',
                  label: 'Open connections',
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByRole('link', { name: /Open connections/ }),
    ).toHaveAttribute(
      'href',
      '/acme/launch/settings/connected-accounts?platform=x#accounts',
    );
  });

  it('renders nothing when the card carries no steps', () => {
    const { container } = renderCard(
      <NextStepsCard action={buildAction({ nextSteps: [] })} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
