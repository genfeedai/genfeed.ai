import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import { describe, expect, it, vi } from 'vitest';

describe('Tabs', () => {
  const renderBasicTabs = () => {
    return render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
        <TabsContent value="tab3">Content 3</TabsContent>
      </Tabs>,
    );
  };

  describe('Tabs Root', () => {
    it('renders without crashing', () => {
      renderBasicTabs();
      expect(screen.getByText('Tab 1')).toBeInTheDocument();
    });

    it('shows default tab content', () => {
      renderBasicTabs();
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });

    it('does not show non-active tab content', () => {
      renderBasicTabs();
      const content2 = screen.queryByText('Content 2');
      if (content2) {
        expect(content2).not.toBeVisible();
      } else {
        expect(content2).toBeNull();
      }
    });

    it('handles controlled value', () => {
      const handleChange = vi.fn();
      render(
        <Tabs value="tab2" onValueChange={handleChange}>
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });
  });

  describe('TabsList', () => {
    it('renders tab triggers', () => {
      renderBasicTabs();
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument();
    });

    it('applies custom className to TabsList', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList className="custom-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
        </Tabs>,
      );

      const tabList = screen.getByRole('tablist');
      expect(tabList).toHaveClass('custom-list');
    });
  });

  describe('TabsTrigger', () => {
    it('switches tabs on click', async () => {
      const user = userEvent.setup();
      renderBasicTabs();

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('marks active tab with aria-selected', () => {
      renderBasicTabs();

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      expect(tab1).toHaveAttribute('aria-selected', 'true');

      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      expect(tab2).toHaveAttribute('aria-selected', 'false');
    });

    it('updates aria-selected when switching tabs', async () => {
      const user = userEvent.setup();
      renderBasicTabs();

      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      await user.click(tab2);

      expect(tab2).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute(
        'aria-selected',
        'false',
      );
    });

    it('applies custom className to trigger', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" className="custom-trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
        </Tabs>,
      );

      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveClass(
        'custom-trigger',
      );
    });

    it('can be disabled', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      const disabledTab = screen.getByRole('tab', { name: 'Tab 2' });
      expect(disabledTab).toBeDisabled();
    });

    it('does not switch to disabled tab', async () => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      const content2 = screen.queryByText('Content 2');
      if (content2) {
        expect(content2).not.toBeVisible();
      } else {
        expect(content2).toBeNull();
      }
    });
  });

  describe('TabsContent', () => {
    it('shows content for active tab', () => {
      renderBasicTabs();
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });

    it('hides content for inactive tabs', () => {
      renderBasicTabs();
      const c2 = screen.queryByText('Content 2');
      const c3 = screen.queryByText('Content 3');
      if (c2) {
        expect(c2).not.toBeVisible();
      } else {
        expect(c2).toBeNull();
      }
      if (c3) {
        expect(c3).not.toBeVisible();
      } else {
        expect(c3).toBeNull();
      }
    });

    it('switches content when tab changes', async () => {
      const user = userEvent.setup();
      renderBasicTabs();

      await user.click(screen.getByRole('tab', { name: 'Tab 3' }));
      expect(screen.getByText('Content 3')).toBeInTheDocument();
      const c1 = screen.queryByText('Content 1');
      if (c1) {
        expect(c1).not.toBeVisible();
      } else {
        expect(c1).toBeNull();
      }
    });

    it('applies custom className to content', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" className="custom-content">
            Content 1
          </TabsContent>
        </Tabs>,
      );

      const content = screen.getByRole('tabpanel');
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('accessibility', () => {
    it('has correct ARIA roles', () => {
      renderBasicTabs();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1); // Only active panel
    });

    it('links tabs to panels with aria-controls', () => {
      renderBasicTabs();
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      expect(tab1).toHaveAttribute('aria-controls');
    });

    it('supports keyboard navigation with arrow keys', async () => {
      const user = userEvent.setup();
      renderBasicTabs();
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      await user.click(tab1); // focus it

      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus();
    });

    it('supports Home key to focus first tab', async () => {
      const user = userEvent.setup();
      renderBasicTabs();
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      await user.click(tab3);

      await user.keyboard('{Home}');
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveFocus();
    });

    it('supports End key to focus last tab', async () => {
      const user = userEvent.setup();
      renderBasicTabs();
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      await user.click(tab1);

      await user.keyboard('{End}');
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveFocus();
    });
  });

  describe('controlled mode', () => {
    it('accepts controlled value prop', () => {
      const { rerender } = render(
        <Tabs value="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      expect(screen.getByText('Content 1')).toBeInTheDocument();

      rerender(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('calls onValueChange when tab is clicked', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(
        <Tabs defaultValue="tab1" onValueChange={handleChange}>
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );

      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(handleChange).toHaveBeenCalledWith('tab2');
    });
  });

  describe('styling', () => {
    it('applies default styles to TabsList', () => {
      renderBasicTabs();
      const tabList = screen.getByRole('tablist');
      expect(tabList).toHaveClass('inline-flex');
      expect(tabList).toHaveClass('items-center');
    });

    it('applies default styles to TabsTrigger', () => {
      renderBasicTabs();
      const trigger = screen.getByRole('tab', { name: 'Tab 1' });
      expect(trigger).toHaveClass('inline-flex');
      expect(trigger).toHaveClass('items-center');
    });

    it('applies disabled styles to disabled trigger', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" disabled>
              Tab 1
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
        </Tabs>,
      );

      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveClass(
        'disabled:pointer-events-none',
      );
    });
  });
});
