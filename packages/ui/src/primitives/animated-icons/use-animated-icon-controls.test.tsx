import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RefAttributes } from 'react';
import { createRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnimatedIconComponent,
  AnimatedIconHandle,
  AnimatedIconProps,
} from './animated-icon.types';
import { AArrowUpIcon } from './icons/a-arrow-up';
import { ActivityIcon } from './icons/activity';
import { ArchiveIcon } from './icons/archive';
import { ArrowLeftIcon } from './icons/arrow-left';
import { ArrowRightIcon } from './icons/arrow-right';
import { ArrowUpIcon } from './icons/arrow-up';
import { AtSignIcon } from './icons/at-sign';
import { AudioLinesIcon } from './icons/audio-lines';
import { BadgePercentIcon } from './icons/badge-percent';
import { BellIcon } from './icons/bell';
import { BinaryIcon } from './icons/binary';
import { BlocksIcon } from './icons/blocks';
import { BoldIcon } from './icons/bold';
import { BookTextIcon } from './icons/book-text';
import { BookmarkIcon } from './icons/bookmark';
import { BookmarkCheckIcon } from './icons/bookmark-check';
import { BotIcon } from './icons/bot';
import { BoxIcon } from './icons/box';
import { BrainIcon } from './icons/brain';
import { BriefcaseBusinessIcon } from './icons/briefcase-business';
import { CalendarDaysIcon } from './icons/calendar-days';
import { ChartLineIcon } from './icons/chart-line';
import { ChartPieIcon } from './icons/chart-pie';
import { CheckIcon } from './icons/check';
import { ChevronLeftIcon } from './icons/chevron-left';
import { ChevronRightIcon } from './icons/chevron-right';
import { ChevronUpIcon } from './icons/chevron-up';
import { CircleCheckIcon } from './icons/circle-check';
import { CircleDollarSignIcon } from './icons/circle-dollar-sign';
import { CircleHelpIcon } from './icons/circle-help';
import { ClapIcon } from './icons/clap';
import { ClipboardCheckIcon } from './icons/clipboard-check';
import { CloudSyncIcon } from './icons/cloud-sync';
import { CogIcon } from './icons/cog';
import { CopyIcon } from './icons/copy';
import { CpuIcon } from './icons/cpu';
import { CreditCardIcon } from './icons/credit-card';
import { DownloadIcon } from './icons/download';
import { ExpandIcon } from './icons/expand';
import { ExternalLinkIcon } from './icons/external-link';
import { EyeIcon } from './icons/eye';
import { FilePenLineIcon } from './icons/file-pen-line';
import { FileStackIcon } from './icons/file-stack';
import { FileTextIcon as FILE_TEXT } from './icons/file-text';
import { FlameIcon } from './icons/flame';
import { FolderOpenIcon } from './icons/folder-open';
import { FrameIcon } from './icons/frame';
import { GaugeIcon } from './icons/gauge';
import { GavelIcon } from './icons/gavel';
import { GraduationCapIcon } from './icons/graduation-cap';
import { HandCoinsIcon } from './icons/hand-coins';
import { HandHeartIcon } from './icons/hand-heart';
import { HistoryIcon } from './icons/history';
import { IdCardIcon } from './icons/id-card';
import { ItalicIcon } from './icons/italic';
import { KeyIcon } from './icons/key';
import { LayoutGridIcon } from './icons/layout-grid';
import { LinkIcon } from './icons/link';
import { LockIcon } from './icons/lock';
import { LockKeyholeIcon } from './icons/lock-keyhole';
import { MailCheckIcon } from './icons/mail-check';
import { Maximize2Icon } from './icons/maximize-2';
import { MessageSquareIcon } from './icons/message-square';
import { MicIcon } from './icons/mic';
import { PanelLeftCloseIcon } from './icons/panel-left-close';
import { PanelLeftOpenIcon } from './icons/panel-left-open';
import { PauseIcon } from './icons/pause';
import { PenToolIcon } from './icons/pen-tool';
import { PlayIcon } from './icons/play';
import { PlugZapIcon } from './icons/plug-zap';
import { PlusIcon } from './icons/plus';
import { RefreshCCWIcon } from './icons/refresh-ccw';
import { RefreshCWIcon } from './icons/refresh-cw';
import { RocketIcon } from './icons/rocket';
import { RotateCCWIcon } from './icons/rotate-ccw';
import { RouteIcon } from './icons/route';
import { ScissorsIcon } from './icons/scissors';
import { SearchIcon } from './icons/search';
import { SendIcon } from './icons/send';
import { ServerIcon } from './icons/server';
import { ServerCrashIcon } from './icons/server-crash';
import { SettingsIcon } from './icons/settings';
import { ShieldCheckIcon } from './icons/shield-check';
import { SlidersHorizontalIcon } from './icons/sliders-horizontal';
import { SmileIcon } from './icons/smile';
import { SquareActivityIcon } from './icons/square-activity';
import { SquarePenIcon } from './icons/square-pen';
import { TelescopeIcon } from './icons/telescope';
import { TerminalIcon } from './icons/terminal';
import { ThermometerIcon } from './icons/thermometer';
import { TrendingUpIcon } from './icons/trending-up';
import { UploadIcon } from './icons/upload';
import { UserIcon } from './icons/user';
import { UserCheckIcon } from './icons/user-check';
import { UserPlusIcon } from './icons/user-plus';
import { UserRoundPlusIcon } from './icons/user-round-plus';
import { UsersIcon } from './icons/users';
import { UsersRoundIcon } from './icons/users-round';
import { WalletIcon } from './icons/wallet';
import { WaypointsIcon } from './icons/waypoints';
import { WebhookIcon } from './icons/webhook';
import { WorkflowIcon } from './icons/workflow';
import { WrenchIcon } from './icons/wrench';
import { XIcon } from './icons/x';
import { ZapIcon } from './icons/zap';

const mocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('motion/react', async (importOriginal) => {
  const motion = await importOriginal<typeof import('motion/react')>();
  return {
    ...motion,
    useAnimation: () => {
      const controls = motion.useAnimation();
      controls.start = mocks.start;
      return controls;
    },
  };
});

const icons: Array<[string, AnimatedIconComponent, number]> = [
  ['a-arrow-up', AArrowUpIcon, 18],
  ['activity', ActivityIcon, 18],
  ['archive', ArchiveIcon, 18],
  ['arrow-left', ArrowLeftIcon, 18],
  ['arrow-right', ArrowRightIcon, 18],
  ['arrow-up', ArrowUpIcon, 18],
  ['at-sign', AtSignIcon, 18],
  ['audio-lines', AudioLinesIcon, 18],
  ['bell', BellIcon, 18],
  ['binary', BinaryIcon, 18],
  ['blocks', BlocksIcon, 18],
  ['bold', BoldIcon, 18],
  ['book-text', BookTextIcon, 18],
  ['bookmark', BookmarkIcon, 18],
  ['bot', BotIcon, 18],
  ['box', BoxIcon, 18],
  ['brain', BrainIcon, 18],
  ['chart-line', ChartLineIcon, 18],
  ['chart-pie', ChartPieIcon, 18],
  ['check', CheckIcon, 18],
  ['chevron-left', ChevronLeftIcon, 18],
  ['chevron-up', ChevronUpIcon, 18],
  ['circle-check', CircleCheckIcon, 18],
  ['circle-help', CircleHelpIcon, 18],
  ['clap', ClapIcon, 18],
  ['cloud-sync', CloudSyncIcon, 18],
  ['cog', CogIcon, 18],
  ['copy', CopyIcon, 18],
  ['cpu', CpuIcon, 18],
  ['credit-card', CreditCardIcon, 18],
  ['download', DownloadIcon, 18],
  ['expand', ExpandIcon, 18],
  ['eye', EyeIcon, 18],
  ['file-pen-line', FilePenLineIcon, 18],
  ['file-stack', FileStackIcon, 18],
  ['file-text', FILE_TEXT, 18],
  ['flame', FlameIcon, 18],
  ['frame', FrameIcon, 18],
  ['gauge', GaugeIcon, 18],
  ['gavel', GavelIcon, 18],
  ['hand-coins', HandCoinsIcon, 18],
  ['hand-heart', HandHeartIcon, 18],
  ['history', HistoryIcon, 18],
  ['id-card', IdCardIcon, 18],
  ['italic', ItalicIcon, 18],
  ['key', KeyIcon, 18],
  ['layout-grid', LayoutGridIcon, 18],
  ['link', LinkIcon, 18],
  ['lock-keyhole', LockKeyholeIcon, 18],
  ['lock', LockIcon, 18],
  ['mail-check', MailCheckIcon, 18],
  ['maximize-2', Maximize2Icon, 18],
  ['mic', MicIcon, 18],
  ['pause', PauseIcon, 18],
  ['pen-tool', PenToolIcon, 18],
  ['play', PlayIcon, 18],
  ['plug-zap', PlugZapIcon, 18],
  ['plus', PlusIcon, 18],
  ['rocket', RocketIcon, 18],
  ['route', RouteIcon, 18],
  ['scissors', ScissorsIcon, 18],
  ['search', SearchIcon, 18],
  ['send', SendIcon, 18],
  ['server-crash', ServerCrashIcon, 24],
  ['settings', SettingsIcon, 18],
  ['shield-check', ShieldCheckIcon, 18],
  ['square-activity', SquareActivityIcon, 18],
  ['square-pen', SquarePenIcon, 18],
  ['telescope', TelescopeIcon, 18],
  ['terminal', TerminalIcon, 18],
  ['thermometer', ThermometerIcon, 18],
  ['trending-up', TrendingUpIcon, 18],
  ['upload', UploadIcon, 18],
  ['user-check', UserCheckIcon, 18],
  ['user-plus', UserPlusIcon, 18],
  ['user', UserIcon, 18],
  ['users-round', UsersRoundIcon, 18],
  ['users', UsersIcon, 18],
  ['wallet', WalletIcon, 18],
  ['waypoints', WaypointsIcon, 18],
  ['webhook', WebhookIcon, 18],
  ['workflow', WorkflowIcon, 18],
  ['wrench', WrenchIcon, 18],
  ['x', XIcon, 18],
  ['zap', ZapIcon, 18],
  ['badge-percent', BadgePercentIcon, 18],
  ['bookmark-check', BookmarkCheckIcon, 18],
  ['briefcase-business', BriefcaseBusinessIcon, 18],
  ['calendar-days', CalendarDaysIcon, 18],
  ['chevron-right', ChevronRightIcon, 18],
  ['circle-dollar-sign', CircleDollarSignIcon, 18],
  ['clipboard-check', ClipboardCheckIcon, 18],
  ['external-link', ExternalLinkIcon, 18],
  ['folder-open', FolderOpenIcon, 18],
  ['graduation-cap', GraduationCapIcon, 18],
  ['message-square', MessageSquareIcon, 18],
  ['panel-left-close', PanelLeftCloseIcon, 18],
  ['panel-left-open', PanelLeftOpenIcon, 18],
  ['refresh-ccw', RefreshCCWIcon, 18],
  ['refresh-cw', RefreshCWIcon, 18],
  ['rotate-ccw', RotateCCWIcon, 18],
  ['server', ServerIcon, 18],
  ['sliders-horizontal', SlidersHorizontalIcon, 18],
  ['smile', SmileIcon, 18],
  ['user-round-plus', UserRoundPlusIcon, 18],
];

describe.each(icons)(
  '%s icon controller contract',
  (_name, Icon, expectedSvgSize) => {
    beforeEach(() => mocks.start.mockClear());

    function Host({
      ref,
      ...props
    }: AnimatedIconProps & RefAttributes<AnimatedIconHandle>) {
      const [interaction, setInteraction] = useState('idle');
      return (
        <>
          <Icon
            {...props}
            ref={ref}
            onMouseEnter={() => setInteraction('entered')}
            onMouseLeave={() => setInteraction('left')}
            onClick={() => setInteraction('clicked')}
          />
          <span role="status">{interaction}</span>
        </>
      );
    }

    it('animates autonomous hover without changing its host state', () => {
      render(<Host data-testid="icon" />);
      mocks.start.mockClear();

      fireEvent.mouseEnter(screen.getByTestId('icon'));
      expect(mocks.start).toHaveBeenLastCalledWith('animate');
      fireEvent.mouseLeave(screen.getByTestId('icon'));
      expect(mocks.start).toHaveBeenLastCalledWith('normal');
      expect(screen.getByRole('status')).toHaveTextContent('idle');
    });

    it('exposes imperative controls and delegates hover to its host', async () => {
      const ref = createRef<AnimatedIconHandle>();
      render(<Host ref={ref} data-testid="icon" />);

      expect(ref.current).not.toBeNull();
      await act(async () => {
        await ref.current?.startAnimation();
      });
      expect(mocks.start).toHaveBeenLastCalledWith('animate');
      await act(async () => {
        await ref.current?.stopAnimation();
      });
      expect(mocks.start).toHaveBeenLastCalledWith('normal');
      mocks.start.mockClear();

      fireEvent.mouseEnter(screen.getByTestId('icon'));
      expect(screen.getByRole('status')).toHaveTextContent('entered');
      fireEvent.mouseLeave(screen.getByTestId('icon'));
      expect(screen.getByRole('status')).toHaveTextContent('left');
      expect(mocks.start).not.toHaveBeenCalled();
    });

    it('preserves div attributes, visible click state and SVG dimensions', () => {
      render(
        <Host
          data-testid="icon"
          size={18}
          className="probe"
          title="Icon title"
          aria-label="Custom icon"
        />,
      );
      const wrapper = screen.getByTestId('icon');
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper).toHaveClass('inline-flex', 'shrink-0', 'probe');
      expect(wrapper).toHaveAttribute('title', 'Icon title');
      expect(wrapper).toHaveAttribute('aria-label', 'Custom icon');
      expect(wrapper.querySelector('svg')).toHaveAttribute(
        'width',
        String(expectedSvgSize),
      );
      expect(wrapper.querySelector('svg')).toHaveAttribute(
        'height',
        String(expectedSvgSize),
      );
      fireEvent.click(wrapper);
      expect(screen.getByRole('status')).toHaveTextContent('clicked');
    });
  },
);
