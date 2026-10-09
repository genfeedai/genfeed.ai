import { RouterPriority } from '@genfeedai/contracts';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupFrontDoor from '@ui/dropdowns/generation-setup/GenerationSetupFrontDoor';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const defaults: GenerationSetupFrontDoorProps = {
  capabilities: {
    hasAspectRatio: true,
    hasBrandEnrichment: true,
    hasDuration: false,
    hasIdentity: false,
    hasInstrumentalToggle: false,
    hasLook: true,
    hasLyrics: false,
    hasModelSelection: true,
    hasOutputs: true,
    hasReferences: false,
    hasSpeech: false,
    hasStyle: false,
  },
  lookOptions: {},
  models: [],
  onCustomize: vi.fn(),
  onResetAll: vi.fn(),
  onSetField: vi.fn(),
  presets: [],
  setup: {
    sources: {},
    values: {
      aspectRatio: '1:1',
      brandingMode: 'off',
      isPromptEnhanceEnabled: false,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      type: 'image',
    },
  },
  typeOptions: [{ label: 'Image', value: 'image' }],
};

function Fixture({
  onApply,
  isDisabled = false,
  hasSubmenus = true,
}: {
  onApply: () => void;
  isDisabled?: boolean;
  hasSubmenus?: boolean;
}) {
  const [activeSection, setActiveSection] =
    useState<GenerationSetupCustomizeSectionId>();
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <button type="button">Setup</button>
      </PopoverTrigger>
      <PopoverContent data-testid="root-picker">
        <GenerationSetupFrontDoor
          {...defaults}
          isDisabled={isDisabled}
          activeSection={activeSection}
          onCloseSection={() => setActiveSection(undefined)}
          onCustomize={setActiveSection}
          renderSection={
            hasSubmenus
              ? (section) => (
                  <div>
                    <input aria-label={`${section} search`} />
                    <button type="button" onClick={onApply}>
                      Apply choice
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection(undefined)}
                    >
                      Back
                    </button>
                  </div>
                )
              : undefined
          }
        />
        <output aria-label="Active section">{activeSection}</output>
      </PopoverContent>
    </Popover>
  );
}

describe('GenerationSetupFrontDoor desktop submenus with real Radix', () => {
  it('opens on hover without applying a value or moving focus; keeps the root and only one child', async () => {
    const onApply = vi.fn();
    render(<Fixture onApply={onApply} />);
    const model = screen.getByRole('button', { name: 'Configure Model' });
    model.focus();
    fireEvent.pointerEnter(model, { pointerType: 'mouse' });
    await screen.findByRole('textbox', { name: 'model search' });
    expect(model).toHaveFocus();
    expect(onApply).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('root-picker')).getByRole('button', {
        name: 'Configure Output',
      }),
    ).toBeVisible();
    fireEvent.pointerEnter(
      screen.getByRole('button', { name: 'Configure Output' }),
      { pointerType: 'mouse' },
    );
    await screen.findByRole('textbox', { name: 'output search' });
    expect(screen.queryByRole('textbox', { name: 'model search' })).toBeNull();
    expect(screen.getAllByTestId('generation-setup-submenu')).toHaveLength(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('cancels a fleeting hover and does not open disabled sections', async () => {
    render(<Fixture onApply={vi.fn()} />);
    const model = screen.getByRole('button', { name: 'Configure Model' });
    fireEvent.pointerEnter(model, { pointerType: 'mouse' });
    fireEvent.pointerLeave(model, { pointerType: 'mouse' });
    fireEvent.pointerEnter(
      screen.getByRole('button', { name: 'Configure Type' }),
      { pointerType: 'mouse' },
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    expect(screen.queryByTestId('generation-setup-submenu')).toBeNull();
  });

  it('activates a hover-open submenu on the first click and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Fixture onApply={onApply} />);
    const model = screen.getByRole('button', { name: 'Configure Model' });
    fireEvent.pointerEnter(model, { pointerType: 'mouse' });
    const search = await screen.findByRole('textbox', { name: 'model search' });
    await user.click(model);
    expect(search).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Apply choice' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('root-picker')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByTestId('generation-setup-submenu')).toBeNull(),
    );
    expect(model).toHaveFocus();
    expect(screen.getByTestId('root-picker')).toBeVisible();
  });

  it('opens and focuses with ArrowRight, and Back preserves the root', async () => {
    const user = userEvent.setup();
    render(<Fixture onApply={vi.fn()} />);
    screen.getByRole('button', { name: 'Configure Output' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(
      await screen.findByRole('textbox', { name: 'output search' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('generation-setup-submenu')).toBeNull();
    expect(screen.getByTestId('root-picker')).toBeVisible();
  });

  it('does not hover-open on touch and keeps click navigation without desktop submenus', async () => {
    const user = userEvent.setup();
    render(<Fixture onApply={vi.fn()} hasSubmenus={false} />);
    const model = screen.getByRole('button', { name: 'Configure Model' });
    fireEvent.pointerEnter(model, { pointerType: 'touch' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    expect(screen.getByLabelText('Active section')).toBeEmptyDOMElement();
    await user.click(model);
    expect(screen.getByLabelText('Active section')).toHaveTextContent('model');
    expect(screen.queryByTestId('generation-setup-submenu')).toBeNull();
  });

  it('ignores touch pointer entry even when desktop submenus are available', async () => {
    render(<Fixture onApply={vi.fn()} />);
    const event = new Event('pointerover', { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    fireEvent(screen.getByRole('button', { name: 'Configure Model' }), event);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    expect(screen.queryByTestId('generation-setup-submenu')).toBeNull();
  });
});
