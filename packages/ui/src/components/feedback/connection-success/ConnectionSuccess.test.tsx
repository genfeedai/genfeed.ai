import { render, screen } from '@testing-library/react';
import ConnectionSuccess from '@ui/feedback/connection-success/ConnectionSuccess';
import {
  resolveAgentConnectionBrand,
  resolveConnectionAgent,
  resolvePlatformConnectionBrand,
} from '@ui/feedback/connection-success/connection-brand';
import { describe, expect, it } from 'vitest';

describe('ConnectionSuccess', () => {
  it('announces the connection and traces the brand logo', () => {
    const { container } = render(
      <ConnectionSuccess
        brand={resolvePlatformConnectionBrand('instagram')}
        description="Redirecting you back"
        title="Instagram Connected"
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Instagram Connected');
    expect(status).toHaveTextContent('Redirecting you back');

    const mark = container.querySelector('[data-connection-brand="Instagram"]');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({ color: '#E1306C' });

    const trace = container.querySelector('.connection-success-trace');
    expect(trace).toHaveAttribute('data-ready', 'true');
    const tracedShapes = trace?.querySelectorAll('path') ?? [];
    expect(tracedShapes.length).toBeGreaterThan(0);
    for (const shape of tracedShapes) {
      expect(shape).toHaveAttribute('pathLength', '1');
    }
    expect(
      container.querySelector('.connection-success-fill svg'),
    ).toBeInTheDocument();
  });

  it('keeps a static success state for reduced motion', () => {
    render(
      <ConnectionSuccess
        brand={resolveAgentConnectionBrand('claude')}
        title="Connected to Claude"
      />,
    );

    expect(
      document.head.querySelector(
        'style[data-href="genfeed-connection-success"]',
      )?.textContent,
    ).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*connection-success-trace \{ display: none; \}/,
    );
  });
});

describe('connection brands', () => {
  it.each([
    ['instagram', 'Instagram', '#E1306C'],
    ['youtube', 'YouTube', '#FF0000'],
    ['google-ads', 'Google Ads', undefined],
    ['twitter', 'X', undefined],
    ['x', 'X', undefined],
    ['tiktok', 'TikTok', undefined],
  ])('resolves the %s platform brand', (platform, name, color) => {
    const brand = resolvePlatformConnectionBrand(platform);

    expect(brand.name).toBe(name);
    expect(brand.color).toBe(color);
  });

  it.each([
    ['Claude Code', 'claude'],
    ['claude-code', 'claude'],
    ['Codex', 'codex'],
    ['ChatGPT', 'chatgpt'],
    ['OpenAI Agents', 'chatgpt'],
    ['Cursor', 'cursor'],
    ['Grok Bot', 'grok'],
    ['generic', 'generic'],
    [null, 'generic'],
  ])('maps the %s OAuth client to the %s agent', (clientName, agent) => {
    expect(resolveConnectionAgent(clientName)).toBe(agent);
  });
});
