import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoQaNode } from './VideoQaNode';

const mockUpdateNodeData = vi.fn();
const mockExecuteNode = vi.fn();
const mockGetConnectedInputs = vi.fn();

vi.mock('../../stores/workflow', () => ({
  useWorkflowStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({
      getConnectedInputs: mockGetConnectedInputs,
      updateNodeData: mockUpdateNodeData,
    }),
  ),
}));

vi.mock('../../stores/execution', () => ({
  useExecutionStore: vi.fn((selector: (state: unknown) => unknown) =>
    selector({ executeNode: mockExecuteNode }),
  ),
}));

vi.mock('../BaseNode', () => ({
  BaseNode: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-node">{children}</div>
  ),
}));

vi.mock('@genfeedai/ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock('@genfeedai/ui/primitives/checkbox', () => ({
  Checkbox: ({
    checked,
    id,
    onCheckedChange,
  }: {
    checked?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      checked={Boolean(checked)}
      data-testid="contact-sheet-checkbox"
      id={id}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type="checkbox"
    />
  ),
}));

vi.mock('@genfeedai/ui/primitives/input', () => ({
  Input: ({
    id,
    onChange,
    value,
  }: {
    id?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    value?: string | number;
  }) => <input id={id} onChange={onChange} value={value ?? ''} />,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        connectVideo: 'Connect a video to inspect',
        contactSheet: 'Render contact sheet',
        contactSheetAlt: 'Video QA contact sheet',
        duration: 'Duration: {value}',
        fail: 'Fail',
        inspect: 'Inspect video',
        inspecting: 'Inspecting...',
        loudness: '{value} LUFS',
        loudnessNa: 'Loudness: n/a',
        loudnessTarget: 'Loudness target (LUFS)',
        pass: 'Pass',
        resolutionFallback: 'Resolution: —',
      };
      const template = copy[key] ?? key;
      if (!values) {
        return template;
      }
      return template.replace('{value}', String(values.value));
    },
}));

const defaultProps = {
  data: {
    expectedDurationSeconds: null,
    expectedFrameRate: null,
    expectedHeight: null,
    expectedWidth: null,
    hasExpectedAudio: null,
    inputVideo: null,
    isContactSheetEnabled: false,
    jobId: null,
    label: 'Video QA',
    loudnessTargetLufs: -16,
    report: null,
    status: 'idle',
  },
  deletable: true,
  draggable: true,
  dragging: false,
  id: 'node-qa',
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  selectable: true,
  selected: false,
  type: 'videoQa',
  zIndex: 0,
} as const;

describe('VideoQaNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectedInputs.mockReturnValue(new Map());
  });

  it('renders a connect-video placeholder when no video is present', () => {
    render(<VideoQaNode {...defaultProps} />);
    expect(screen.getByText('Connect a video to inspect')).toBeInTheDocument();
  });

  it('disables inspect without a video', () => {
    render(<VideoQaNode {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /inspect video/i }),
    ).toBeDisabled();
  });

  it('shows the default loudness target', () => {
    render(<VideoQaNode {...defaultProps} />);
    expect(screen.getByDisplayValue('-16')).toBeInTheDocument();
  });

  it('enables inspect when a video is connected', () => {
    mockGetConnectedInputs.mockReturnValue(
      new Map([['video', 'https://cdn.example/in.mp4']]),
    );
    render(<VideoQaNode {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /inspect video/i }),
    ).not.toBeDisabled();
  });

  it('toggles the contact sheet flag', () => {
    render(<VideoQaNode {...defaultProps} />);
    fireEvent.click(screen.getByTestId('contact-sheet-checkbox'));
    expect(mockUpdateNodeData).toHaveBeenCalledWith('node-qa', {
      isContactSheetEnabled: true,
    });
  });

  it('shows pass metrics after a healthy report', () => {
    render(
      <VideoQaNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          inputVideo: 'https://cdn.example/in.mp4',
          report: {
            blackSegments: [],
            contactSheetUrl: null,
            decodeOk: true,
            durationSeconds: 10,
            failures: [],
            frameRate: 30,
            freezeSegments: [],
            height: 1080,
            loudnessDeviation: -0.1,
            loudnessLufs: -16.1,
            loudnessTargetLufs: -16,
            passed: true,
            streams: [],
            width: 1920,
          },
        }}
      />,
    );

    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText(/10\.0s/)).toBeInTheDocument();
    expect(screen.getByText(/1920×1080/)).toBeInTheDocument();
    expect(screen.getByText(/-16\.1 LUFS/)).toBeInTheDocument();
  });

  it('shows failure timestamps from the report', () => {
    render(
      <VideoQaNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          inputVideo: 'https://cdn.example/in.mp4',
          report: {
            blackSegments: [{ end: 2.5, start: 1 }],
            contactSheetUrl: null,
            decodeOk: true,
            durationSeconds: 10,
            failures: [
              {
                code: 'BLACK_FRAMES',
                message: 'Black-frame segment 1.00s–2.50s',
                timestamp: 1,
              },
              {
                code: 'FREEZE_FRAMES',
                message: 'Freeze segment 4.00s–6.25s',
                timestamp: 4,
              },
              {
                code: 'LOUDNESS_OFF_TARGET',
                message: 'Loudness -23.0 LUFS vs target -16 LUFS',
                timestamp: null,
              },
            ],
            frameRate: 30,
            freezeSegments: [{ end: 6.25, start: 4 }],
            height: 1080,
            loudnessDeviation: -7,
            loudnessLufs: -23,
            loudnessTargetLufs: -16,
            passed: false,
            streams: [],
            width: 1920,
          },
        }}
      />,
    );

    expect(screen.getByText('Fail')).toBeInTheDocument();
    expect(screen.getByText(/@ 1.00s/)).toBeInTheDocument();
    expect(screen.getByText(/@ 4.00s/)).toBeInTheDocument();
    expect(
      screen.getByText(/Loudness -23.0 LUFS vs target -16 LUFS/),
    ).toBeInTheDocument();
  });
});
