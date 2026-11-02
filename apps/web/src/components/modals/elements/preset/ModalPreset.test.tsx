import type { PresetElementSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalPreset from '@/components/modals/elements/preset/ModalPreset';
import ui from '../../../../../messages/en/ui.json';

const fixture = vi.hoisted(() => ({
  transform: null as ((data: PresetElementSchema) => unknown) | null,
  values: null as (() => PresetElementSchema) | null,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'current-org', brandId: 'current-brand' }),
}));
vi.mock('@/hooks/ui/use-prompt-enhance/use-prompt-enhance', () => ({
  usePromptEnhance: () => ({ enhance: vi.fn(), isEnhancing: false }),
}));
vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: import('react').PropsWithChildren) => (
    <div>{children}</div>
  ),
}));
vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: import('react').PropsWithChildren) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/hooks/ui/use-crud-modal/use-crud-modal', async () => {
  const { useForm } = await import('react-hook-form');
  return {
    useCrudModal: (
      options: Parameters<
        typeof import('@/hooks/ui/use-crud-modal/use-crud-modal').useCrudModal<
          IPreset,
          PresetElementSchema
        >
      >[0],
    ) => {
      const form = useForm<PresetElementSchema>({
        defaultValues: { ...options.defaultValues, ...options.entity },
      });
      fixture.transform = options.transformSubmitData ?? null;
      fixture.values = form.getValues;
      return {
        form,
        formRef: { current: null },
        isSubmitting: false,
        onSubmit: vi.fn(),
        closeModal: vi.fn(),
      };
    },
  };
});

function renderPreset(element: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ui }}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe('ModalPreset', () => {
  beforeEach(() => {
    fixture.transform = null;
    fixture.values = null;
  });
  const input = {
    category: ModelCategory.IMAGE,
    isActive: true,
    key: 'studio-banner',
    label: 'Banner',
  };
  it('scopes newly created presets to the current organization and brand', () => {
    renderPreset(<ModalPreset onConfirm={vi.fn()} />);
    expect(fixture.transform?.(input)).toMatchObject({
      organizationId: 'current-org',
      brandId: 'current-brand',
    });
  });
  it('fills the generation prompt, duration and activation using the shared controls', () => {
    renderPreset(<ModalPreset onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Generation prompt'), {
      target: { value: 'Edited prompt' },
    });
    fireEvent.change(screen.getByLabelText('Video duration (seconds)'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(fixture.values?.()).toMatchObject({
      prompt: 'Edited prompt',
      duration: 8,
      isActive: false,
    });
    fireEvent.change(screen.getByLabelText('Video duration (seconds)'), {
      target: { value: '' },
    });
    expect(fixture.values?.().duration).toBeUndefined();
  });
});
