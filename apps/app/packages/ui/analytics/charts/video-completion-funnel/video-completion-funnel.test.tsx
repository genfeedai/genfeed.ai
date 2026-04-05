import { VideoCompletionFunnel } from '@ui/analytics/charts/video-completion-funnel/video-completion-funnel';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const mockData = {
  completed25: 7500,
  completed50: 5000,
  completed75: 3000,
  completed100: 2000,
  started: 10000,
};

const perfectData = {
  completed25: 1000,
  completed50: 1000,
  completed75: 1000,
  completed100: 1000,
  started: 1000,
};

const poorData = {
  completed25: 1000,
  completed50: 500,
  completed75: 100,
  completed100: 50,
  started: 10000,
};

describe('VideoCompletionFunnel', () => {
  describe('Basic Rendering', () => {
    it('renders the funnel container', () => {
      const { container } = render(<VideoCompletionFunnel data={mockData} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <VideoCompletionFunnel data={mockData} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('renders all five stages', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByText('25% Complete')).toBeInTheDocument();
      expect(screen.getByText('50% Complete')).toBeInTheDocument();
      expect(screen.getByText('75% Complete')).toBeInTheDocument();
      expect(screen.getByText('100% Complete')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const { container } = render(
        <VideoCompletionFunnel data={mockData} isLoading />,
      );
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('hides funnel content when loading', () => {
      render(<VideoCompletionFunnel data={mockData} isLoading />);
      expect(screen.queryByText('Started')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty message when started is 0', () => {
      const emptyData = {
        completed25: 0,
        completed50: 0,
        completed75: 0,
        completed100: 0,
        started: 0,
      };
      render(<VideoCompletionFunnel data={emptyData} />);
      expect(
        screen.getByText('No video completion data available'),
      ).toBeInTheDocument();
    });

    it('does not show empty message when loading', () => {
      const emptyData = {
        completed25: 0,
        completed50: 0,
        completed75: 0,
        completed100: 0,
        started: 0,
      };
      render(<VideoCompletionFunnel data={emptyData} isLoading />);
      expect(
        screen.queryByText('No video completion data available'),
      ).not.toBeInTheDocument();
    });

    it('hides summary stats when empty', () => {
      const emptyData = {
        completed25: 0,
        completed50: 0,
        completed75: 0,
        completed100: 0,
        started: 0,
      };
      render(<VideoCompletionFunnel data={emptyData} />);
      expect(screen.queryByText('Completion Rate')).not.toBeInTheDocument();
    });
  });

  describe('Stage Values', () => {
    it('displays started value', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText('10K')).toBeInTheDocument();
    });

    it('displays viewers label for each stage', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      const viewersLabels = screen.getAllByText('viewers');
      expect(viewersLabels.length).toBe(5);
    });

    it('formats large numbers with compact notation', () => {
      const bigData = {
        completed25: 1000000,
        completed50: 500000,
        completed75: 250000,
        completed100: 100000,
        started: 1500000,
      };
      render(<VideoCompletionFunnel data={bigData} />);
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });
  });

  describe('Percentage Calculations', () => {
    it('displays 100% for started stage', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });

    it('calculates correct percentage for 25% complete', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      // 7500/10000 = 75%
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });

    it('calculates correct percentage for 50% complete', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      // 5000/10000 = 50%
      const percentageElements = screen.getAllByText('50.0%');
      expect(percentageElements.length).toBeGreaterThanOrEqual(1);
    });

    it('calculates correct completion rate for 100% complete', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      // 2000/10000 = 20%
      const percentageElements = screen.getAllByText('20.0%');
      expect(percentageElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Drop-off Indicators', () => {
    it('displays drop-off indicators between stages', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      const dropOffs = screen.getAllByText(/drop-off/);
      expect(dropOffs.length).toBe(4);
    });

    it('shows arrow indicator for drop-off', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      const arrows = screen.getAllByText('↓');
      expect(arrows.length).toBe(4);
    });

    it('calculates correct drop-off rate', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      // First drop-off: (10000 - 7500) / 10000 = 25%
      expect(screen.getByText('25.0% drop-off')).toBeInTheDocument();
    });
  });

  describe('Summary Stats', () => {
    it('displays completion rate summary', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    });

    it('displays watched 50%+ summary', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText('Watched 50%+')).toBeInTheDocument();
    });

    it('displays did not finish summary', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      expect(screen.getByText("Didn't Finish")).toBeInTheDocument();
    });

    it('calculates correct number of viewers who did not finish', () => {
      render(<VideoCompletionFunnel data={mockData} />);
      // 10000 - 2000 = 8000 = 8K
      expect(screen.getByText('8K')).toBeInTheDocument();
    });
  });

  describe('Height Configuration', () => {
    it('uses default height of 350', () => {
      const { container } = render(<VideoCompletionFunnel data={mockData} />);
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '350px' });
    });

    it('accepts custom height', () => {
      const { container } = render(
        <VideoCompletionFunnel data={mockData} height={500} />,
      );
      const chartContainer = container.querySelector('[style*="height"]');
      expect(chartContainer).toHaveStyle({ height: '500px' });
    });
  });

  describe('Bar Colors', () => {
    it('applies success color for high percentages', () => {
      const { container } = render(
        <VideoCompletionFunnel data={perfectData} />,
      );
      const successBars = container.querySelectorAll('.bg-success');
      expect(successBars.length).toBeGreaterThan(0);
    });

    it('applies warning color for medium percentages', () => {
      const { container } = render(<VideoCompletionFunnel data={mockData} />);
      const warningBars = container.querySelectorAll('.bg-warning');
      expect(warningBars.length).toBeGreaterThan(0);
    });

    it('applies muted color for very low percentages (<25%)', () => {
      const { container } = render(<VideoCompletionFunnel data={poorData} />);
      // poorData has percentages: 10%, 5%, 1%, 0.5% - all below 25% so they get bg-muted
      const baseBars = container.querySelectorAll('.bg-muted');
      expect(baseBars.length).toBeGreaterThan(0);
    });
  });

  describe('Perfect Completion Data', () => {
    it('shows 100% for all stages when all viewers complete', () => {
      render(<VideoCompletionFunnel data={perfectData} />);
      const fullPercentages = screen.getAllByText('100.0%');
      // 5 stages + completion rate + watched 50%+ stat = 7 instances
      expect(fullPercentages.length).toBe(7);
    });

    it('shows 0% drop-off for perfect retention', () => {
      render(<VideoCompletionFunnel data={perfectData} />);
      const zeroDropOffs = screen.getAllByText('0.0% drop-off');
      expect(zeroDropOffs.length).toBe(4);
    });

    it('shows 0 did not finish for perfect completion', () => {
      render(<VideoCompletionFunnel data={perfectData} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Poor Completion Data', () => {
    it('displays very low completion rate', () => {
      render(<VideoCompletionFunnel data={poorData} />);
      // 50/10000 = 0.5%
      const percentageElements = screen.getAllByText('0.5%');
      expect(percentageElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows high drop-off rates', () => {
      render(<VideoCompletionFunnel data={poorData} />);
      // First drop-off: (10000 - 1000) / 10000 = 90%
      expect(screen.getByText('90.0% drop-off')).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    it('renders grid layout for summary stats', () => {
      const { container } = render(<VideoCompletionFunnel data={mockData} />);
      const grid = container.querySelector('.grid-cols-3');
      expect(grid).toBeInTheDocument();
    });

    it('renders space-y layout for stages', () => {
      const { container } = render(<VideoCompletionFunnel data={mockData} />);
      const spaceY = container.querySelector('.space-y-4');
      expect(spaceY).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles data where viewers increase at later stages', () => {
      const anomalyData = {
        completed25: 1200, // More than started (anomaly)
        completed50: 800,
        completed75: 500,
        completed100: 200,
        started: 1000,
      };
      const { container } = render(
        <VideoCompletionFunnel data={anomalyData} />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles very small numbers', () => {
      const smallData = {
        completed25: 8,
        completed50: 5,
        completed75: 3,
        completed100: 1,
        started: 10,
      };
      render(<VideoCompletionFunnel data={smallData} />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});
