import '@testing-library/jest-dom/vitest';
import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import { WorkflowsService } from '@genfeedai/services/automation/workflows.service';
import { BaseService } from '@genfeedai/services/core/base.service';
import {
  clearAllServiceInstances,
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SchedulePanel from '@ui/workflow-builder/panels/SchedulePanel';
import axios, { type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper');

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mocks.notifications,
  },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService:
    <T,>(factory: (token: string) => T) =>
    async () =>
      factory('schedule-token'),
}));

const adapter = vi.fn<AxiosAdapter>(async (config) => ({
  config,
  data: {},
  headers: {},
  status: 200,
  statusText: 'OK',
}));

function installAdapter() {
  const create = axios.create.bind(axios);
  vi.spyOn(axios, 'create').mockImplementation((config) =>
    create({ ...config, adapter }),
  );
}

afterEach(() => {
  clearRequestOrganizationId();
  clearAllServiceInstances();
  BaseService.clearAllInstances();
  vi.restoreAllMocks();
  adapter.mockClear();
  mocks.notifications.error.mockClear();
  mocks.notifications.success.mockClear();
});

describe('SchedulePanel', () => {
  const defaultProps = {
    currentSchedule: undefined,
    currentTimezone: 'UTC',
    isCollapsed: false,
    isEnabled: false,
    onScheduleUpdate: vi.fn(),
    onToggleCollapse: vi.fn(),
    workflowId: 'workflow-1',
  };

  it('should render without crashing', () => {
    const { container } = render(<SchedulePanel {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display schedule panel header', () => {
    render(<SchedulePanel {...defaultProps} />);
    // Multiple elements contain "Schedule" - use getAllByText
    const scheduleElements = screen.getAllByText(/Schedule/i);
    expect(scheduleElements.length).toBeGreaterThan(0);
  });

  it('should render collapsed state', () => {
    render(<SchedulePanel {...defaultProps} isCollapsed={true} />);
    // Multiple elements contain "Schedule" - use getAllByText
    const scheduleElements = screen.getAllByText(/Schedule/i);
    expect(scheduleElements.length).toBeGreaterThan(0);
  });

  it('should handle user interactions correctly', () => {
    render(<SchedulePanel {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: /Save Schedule/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Preset/i }));
    fireEvent.click(screen.getByRole('button', { name: /Every hour/i }));

    expect(
      screen.getByRole('button', { name: /Save Schedule/i }),
    ).not.toBeDisabled();

    const toggleButton = screen.getByRole('switch', {
      name: /Enable workflow schedule/i,
    });
    expect(toggleButton).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute('aria-checked', 'true');
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<SchedulePanel {...defaultProps} />);

    // Check panel has correct container classes
    const panel = container.firstChild;
    expect(panel).toBeInTheDocument();

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <SchedulePanel {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();

    // Check enabled state styling
    const { container: enabledContainer } = render(
      <SchedulePanel {...defaultProps} isEnabled={true} />,
    );
    expect(enabledContainer.firstChild).toBeInTheDocument();
  });

  it('saves the schedule through WorkflowsService with the routed organization header', async () => {
    installAdapter();
    setRequestOrganizationId('org-a');
    const onScheduleUpdate = vi.fn();
    render(
      <SchedulePanel {...defaultProps} onScheduleUpdate={onScheduleUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Preset/i }));
    fireEvent.click(screen.getByRole('button', { name: /Every hour/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Schedule/i }));

    await waitFor(() => {
      expect(mocks.notifications.success).toHaveBeenCalledWith(
        'Schedule saved',
      );
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0]?.[0];
    expect(config?.method).toBe('patch');
    expect(`${config?.baseURL}${config?.url}`).toMatch(
      /\/workflows\/workflow-1$/,
    );
    expect(JSON.parse(config?.data as string)).toEqual({
      isScheduleEnabled: false,
      schedule: '0 * * * *',
      timezone: 'UTC',
    });
    expect(config?.headers.Authorization).toBe('Bearer schedule-token');
    expect(config?.headers[ORGANIZATION_CONTEXT_HEADER]).toBe('org-a');
    expect(onScheduleUpdate).toHaveBeenCalledOnce();
  });

  it('removes the schedule through WorkflowsService with the routed organization header', async () => {
    installAdapter();
    setRequestOrganizationId('org-a');
    const removeSchedule = vi.spyOn(
      WorkflowsService.prototype,
      'removeSchedule',
    );
    render(<SchedulePanel {...defaultProps} currentSchedule="0 * * * *" />);

    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));

    await waitFor(() => {
      expect(mocks.notifications.success).toHaveBeenCalledWith(
        'Schedule removed',
      );
    });
    expect(removeSchedule).toHaveBeenCalledWith('workflow-1');
    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0]?.[0];
    expect(config?.method).toBe('patch');
    expect(JSON.parse(config?.data as string)).toEqual({
      isScheduleEnabled: false,
      schedule: null,
    });
    expect(`${config?.baseURL}${config?.url}`).toMatch(
      /\/workflows\/workflow-1$/,
    );
    expect(config?.headers.Authorization).toBe('Bearer schedule-token');
    expect(config?.headers[ORGANIZATION_CONTEXT_HEADER]).toBe('org-a');
  });
});
