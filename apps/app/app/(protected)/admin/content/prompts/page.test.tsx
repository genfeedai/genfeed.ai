import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

import PromptsListRedirect from './list/page';
import PromptsRedirect from './page';

describe('admin prompts routes', () => {
  it.each([
    ['/admin/content/prompts', PromptsRedirect],
    ['/admin/content/prompts/list', PromptsListRedirect],
  ])('redirects %s to the generations page', (_route, Page) => {
    redirect.mockClear();
    Page();
    expect(redirect).toHaveBeenCalledWith(APP_ROUTES.ADMIN.CONTENT.GENERATIONS);
  });
});
