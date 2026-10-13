import { lazy } from 'react';
import type { AnimatedIconComponent } from './animated-icon.types';

type IconLoader = () => Promise<{ default: AnimatedIconComponent }>;

/**
 * Animated twins, keyed by the Lucide icon's `displayName` (aliases such as
 * Home/House share one). Keying by name keeps lucide-react out of this module:
 * no icon component is pulled into a page just because it renders a Button,
 * and tests that mock lucide-react are unaffected.
 *
 * Each twin loads on first hover (see `useHoverAnimatedIcon`). Twins come from
 * the lucide-animated registry or are drawn on Lucide's geometry in
 * `create-animated-icon.tsx`; navigation icons are chosen from this list.
 */
export const ANIMATED_ICON_LOADERS: ReadonlyArray<
  readonly [string, IconLoader]
> = [
  [
    'AArrowUp',
    () =>
      import('./icons/a-arrow-up').then((module) => ({
        default: module.AArrowUpIcon,
      })),
  ],
  [
    'Activity',
    () =>
      import('./icons/activity').then((module) => ({
        default: module.ActivityIcon,
      })),
  ],
  [
    'Archive',
    () =>
      import('./icons/archive').then((module) => ({
        default: module.ArchiveIcon,
      })),
  ],
  [
    'ArrowLeft',
    () =>
      import('./icons/arrow-left').then((module) => ({
        default: module.ArrowLeftIcon,
      })),
  ],
  [
    'ArrowRight',
    () =>
      import('./icons/arrow-right').then((module) => ({
        default: module.ArrowRightIcon,
      })),
  ],
  [
    'ArrowUp',
    () =>
      import('./icons/arrow-up').then((module) => ({
        default: module.ArrowUpIcon,
      })),
  ],
  [
    'AtSign',
    () =>
      import('./icons/at-sign').then((module) => ({
        default: module.AtSignIcon,
      })),
  ],
  [
    'AudioLines',
    () =>
      import('./icons/audio-lines').then((module) => ({
        default: module.AudioLinesIcon,
      })),
  ],
  [
    'BadgePercent',
    () =>
      import('./icons/badge-percent').then((module) => ({
        default: module.BadgePercentIcon,
      })),
  ],
  [
    'Ban',
    () => import('./icons/ban').then((module) => ({ default: module.BanIcon })),
  ],
  [
    'Bell',
    () =>
      import('./icons/bell').then((module) => ({ default: module.BellIcon })),
  ],
  [
    'Binary',
    () =>
      import('./icons/binary').then((module) => ({
        default: module.BinaryIcon,
      })),
  ],
  [
    'Blocks',
    () =>
      import('./icons/blocks').then((module) => ({
        default: module.BlocksIcon,
      })),
  ],
  [
    'Bold',
    () =>
      import('./icons/bold').then((module) => ({ default: module.BoldIcon })),
  ],
  [
    'Bookmark',
    () =>
      import('./icons/bookmark').then((module) => ({
        default: module.BookmarkIcon,
      })),
  ],
  [
    'BookmarkCheck',
    () =>
      import('./icons/bookmark-check').then((module) => ({
        default: module.BookmarkCheckIcon,
      })),
  ],
  [
    'BookText',
    () =>
      import('./icons/book-text').then((module) => ({
        default: module.BookTextIcon,
      })),
  ],
  [
    'Bot',
    () => import('./icons/bot').then((module) => ({ default: module.BotIcon })),
  ],
  [
    'BotMessageSquare',
    () =>
      import('./icons/bot-message-square').then((module) => ({
        default: module.BotMessageSquareIcon,
      })),
  ],
  [
    'Box',
    () => import('./icons/box').then((module) => ({ default: module.BoxIcon })),
  ],
  [
    'Brain',
    () =>
      import('./icons/brain').then((module) => ({ default: module.BrainIcon })),
  ],
  [
    'BriefcaseBusiness',
    () =>
      import('./icons/briefcase-business').then((module) => ({
        default: module.BriefcaseBusinessIcon,
      })),
  ],
  [
    'BuildingComplex',
    () =>
      import('./icons/building-2').then((module) => ({
        default: module.Building2Icon,
      })),
  ],
  [
    'CalendarDays',
    () =>
      import('./icons/calendar-days').then((module) => ({
        default: module.CalendarDaysIcon,
      })),
  ],
  [
    'Captions',
    () =>
      import('./icons/captions').then((module) => ({
        default: module.CaptionsIcon,
      })),
  ],
  [
    'ChartColumnIncreasing',
    () =>
      import('./icons/chart-column-increasing').then((module) => ({
        default: module.ChartColumnIncreasingIcon,
      })),
  ],
  [
    'ChartLine',
    () =>
      import('./icons/chart-line').then((module) => ({
        default: module.ChartLineIcon,
      })),
  ],
  [
    'ChartPie',
    () =>
      import('./icons/chart-pie').then((module) => ({
        default: module.ChartPieIcon,
      })),
  ],
  [
    'ChartScatter',
    () =>
      import('./icons/chart-scatter').then((module) => ({
        default: module.ChartScatterIcon,
      })),
  ],
  [
    'Check',
    () =>
      import('./icons/check').then((module) => ({ default: module.CheckIcon })),
  ],
  [
    'ChevronLeft',
    () =>
      import('./icons/chevron-left').then((module) => ({
        default: module.ChevronLeftIcon,
      })),
  ],
  [
    'ChevronRight',
    () =>
      import('./icons/chevron-right').then((module) => ({
        default: module.ChevronRightIcon,
      })),
  ],
  [
    'ChevronUp',
    () =>
      import('./icons/chevron-up').then((module) => ({
        default: module.ChevronUpIcon,
      })),
  ],
  [
    'CircleCheck',
    () =>
      import('./icons/circle-check').then((module) => ({
        default: module.CircleCheckIcon,
      })),
  ],
  [
    'CircleDollarSign',
    () =>
      import('./icons/circle-dollar-sign').then((module) => ({
        default: module.CircleDollarSignIcon,
      })),
  ],
  [
    'CircleQuestionMark',
    () =>
      import('./icons/circle-help').then((module) => ({
        default: module.CircleHelpIcon,
      })),
  ],
  [
    'Clapperboard',
    () =>
      import('./icons/clap').then((module) => ({ default: module.ClapIcon })),
  ],
  [
    'ClipboardCheck',
    () =>
      import('./icons/clipboard-check').then((module) => ({
        default: module.ClipboardCheckIcon,
      })),
  ],
  [
    'CloudSync',
    () =>
      import('./icons/cloud-sync').then((module) => ({
        default: module.CloudSyncIcon,
      })),
  ],
  [
    'Cog',
    () => import('./icons/cog').then((module) => ({ default: module.CogIcon })),
  ],
  [
    'Copy',
    () =>
      import('./icons/copy').then((module) => ({ default: module.CopyIcon })),
  ],
  [
    'Cpu',
    () => import('./icons/cpu').then((module) => ({ default: module.CpuIcon })),
  ],
  [
    'CreditCard',
    () =>
      import('./icons/credit-card').then((module) => ({
        default: module.CreditCardIcon,
      })),
  ],
  [
    'Download',
    () =>
      import('./icons/download').then((module) => ({
        default: module.DownloadIcon,
      })),
  ],
  [
    'Expand',
    () =>
      import('./icons/expand').then((module) => ({
        default: module.ExpandIcon,
      })),
  ],
  [
    'ExternalLink',
    () =>
      import('./icons/external-link').then((module) => ({
        default: module.ExternalLinkIcon,
      })),
  ],
  [
    'Eye',
    () => import('./icons/eye').then((module) => ({ default: module.EyeIcon })),
  ],
  [
    'FaceSlightlySmiling',
    () =>
      import('./icons/smile').then((module) => ({ default: module.SmileIcon })),
  ],
  [
    'FilePenLine',
    () =>
      import('./icons/file-pen-line').then((module) => ({
        default: module.FilePenLineIcon,
      })),
  ],
  [
    'FileStack',
    () =>
      import('./icons/file-stack').then((module) => ({
        default: module.FileStackIcon,
      })),
  ],
  [
    'FileText',
    () =>
      import('./icons/file-text').then((module) => ({
        default: module.FileTextIcon,
      })),
  ],
  [
    'Film',
    () =>
      import('./icons/film').then((module) => ({ default: module.FilmIcon })),
  ],
  [
    'Flame',
    () =>
      import('./icons/flame').then((module) => ({ default: module.FlameIcon })),
  ],
  [
    'FolderOpen',
    () =>
      import('./icons/folder-open').then((module) => ({
        default: module.FolderOpenIcon,
      })),
  ],
  [
    'Frame',
    () =>
      import('./icons/frame').then((module) => ({ default: module.FrameIcon })),
  ],
  [
    'GalleryHorizontalStart',
    () =>
      import('./icons/gallery-horizontal-start').then((module) => ({
        default: module.GalleryHorizontalStartIcon,
      })),
  ],
  [
    'Gauge',
    () =>
      import('./icons/gauge').then((module) => ({ default: module.GaugeIcon })),
  ],
  [
    'Gavel',
    () =>
      import('./icons/gavel').then((module) => ({ default: module.GavelIcon })),
  ],
  [
    'GraduationCap',
    () =>
      import('./icons/graduation-cap').then((module) => ({
        default: module.GraduationCapIcon,
      })),
  ],
  [
    'Grip',
    () =>
      import('./icons/grip').then((module) => ({ default: module.GripIcon })),
  ],
  [
    'HandCoins',
    () =>
      import('./icons/hand-coins').then((module) => ({
        default: module.HandCoinsIcon,
      })),
  ],
  [
    'HandHeart',
    () =>
      import('./icons/hand-heart').then((module) => ({
        default: module.HandHeartIcon,
      })),
  ],
  [
    'House',
    () =>
      import('./icons/house').then((module) => ({ default: module.HouseIcon })),
  ],
  [
    'IdCard',
    () =>
      import('./icons/id-card').then((module) => ({
        default: module.IdCardIcon,
      })),
  ],
  [
    'Italic',
    () =>
      import('./icons/italic').then((module) => ({
        default: module.ItalicIcon,
      })),
  ],
  [
    'Key',
    () => import('./icons/key').then((module) => ({ default: module.KeyIcon })),
  ],
  [
    'Layers',
    () =>
      import('./icons/layers').then((module) => ({
        default: module.LayersIcon,
      })),
  ],
  [
    'LayoutGrid',
    () =>
      import('./icons/layout-grid').then((module) => ({
        default: module.LayoutGridIcon,
      })),
  ],
  [
    'LibraryBig',
    () =>
      import('./icons/library-big').then((module) => ({
        default: module.LibraryBigIcon,
      })),
  ],
  [
    'Link',
    () =>
      import('./icons/link').then((module) => ({ default: module.LinkIcon })),
  ],
  [
    'Lock',
    () =>
      import('./icons/lock').then((module) => ({ default: module.LockIcon })),
  ],
  [
    'LockKeyhole',
    () =>
      import('./icons/lock-keyhole').then((module) => ({
        default: module.LockKeyholeIcon,
      })),
  ],
  [
    'Mail',
    () =>
      import('./icons/mail').then((module) => ({ default: module.MailIcon })),
  ],
  [
    'MailCheck',
    () =>
      import('./icons/mail-check').then((module) => ({
        default: module.MailCheckIcon,
      })),
  ],
  [
    'Maximize2',
    () =>
      import('./icons/maximize-2').then((module) => ({
        default: module.Maximize2Icon,
      })),
  ],
  [
    'MessageSquare',
    () =>
      import('./icons/message-square').then((module) => ({
        default: module.MessageSquareIcon,
      })),
  ],
  [
    'MessageSquareText',
    () =>
      import('./icons/message-square-text').then((module) => ({
        default: module.MessageSquareTextIcon,
      })),
  ],
  [
    'Mic',
    () => import('./icons/mic').then((module) => ({ default: module.MicIcon })),
  ],
  [
    'Newspaper',
    () =>
      import('./icons/newspaper').then((module) => ({
        default: module.NewspaperIcon,
      })),
  ],
  [
    'Palette',
    () =>
      import('./icons/palette').then((module) => ({
        default: module.PaletteIcon,
      })),
  ],
  [
    'PanelLeftClose',
    () =>
      import('./icons/panel-left-close').then((module) => ({
        default: module.PanelLeftCloseIcon,
      })),
  ],
  [
    'PanelLeftOpen',
    () =>
      import('./icons/panel-left-open').then((module) => ({
        default: module.PanelLeftOpenIcon,
      })),
  ],
  [
    'Pause',
    () =>
      import('./icons/pause').then((module) => ({ default: module.PauseIcon })),
  ],
  [
    'PenTool',
    () =>
      import('./icons/pen-tool').then((module) => ({
        default: module.PenToolIcon,
      })),
  ],
  [
    'Play',
    () =>
      import('./icons/play').then((module) => ({ default: module.PlayIcon })),
  ],
  [
    'PlugZap',
    () =>
      import('./icons/plug-zap').then((module) => ({
        default: module.PlugZapIcon,
      })),
  ],
  [
    'Plus',
    () =>
      import('./icons/plus').then((module) => ({ default: module.PlusIcon })),
  ],
  [
    'PostCard',
    () =>
      import('./icons/post-card').then((module) => ({
        default: module.PostCardIcon,
      })),
  ],
  [
    'Quote',
    () =>
      import('./icons/quote').then((module) => ({ default: module.QuoteIcon })),
  ],
  [
    'Radar',
    () =>
      import('./icons/radar').then((module) => ({ default: module.RadarIcon })),
  ],
  [
    'Radio',
    () =>
      import('./icons/radio').then((module) => ({ default: module.RadioIcon })),
  ],
  [
    'RefreshCcw',
    () =>
      import('./icons/refresh-ccw').then((module) => ({
        default: module.RefreshCCWIcon,
      })),
  ],
  [
    'RefreshCw',
    () =>
      import('./icons/refresh-cw').then((module) => ({
        default: module.RefreshCWIcon,
      })),
  ],
  [
    'Rocket',
    () =>
      import('./icons/rocket').then((module) => ({
        default: module.RocketIcon,
      })),
  ],
  [
    'RotateCcw',
    () =>
      import('./icons/rotate-ccw').then((module) => ({
        default: module.RotateCCWIcon,
      })),
  ],
  [
    'RotateCcwClock',
    () =>
      import('./icons/history').then((module) => ({
        default: module.HistoryIcon,
      })),
  ],
  [
    'Route',
    () =>
      import('./icons/route').then((module) => ({ default: module.RouteIcon })),
  ],
  [
    'ScanFace',
    () =>
      import('./icons/scan-face').then((module) => ({
        default: module.ScanFaceIcon,
      })),
  ],
  [
    'Scissors',
    () =>
      import('./icons/scissors').then((module) => ({
        default: module.ScissorsIcon,
      })),
  ],
  [
    'Search',
    () =>
      import('./icons/search').then((module) => ({
        default: module.SearchIcon,
      })),
  ],
  [
    'Send',
    () =>
      import('./icons/send').then((module) => ({ default: module.SendIcon })),
  ],
  [
    'Server',
    () =>
      import('./icons/server').then((module) => ({
        default: module.ServerIcon,
      })),
  ],
  [
    'ServerCrash',
    () =>
      import('./icons/server-crash').then((module) => ({
        default: module.ServerCrashIcon,
      })),
  ],
  [
    'Settings',
    () =>
      import('./icons/settings').then((module) => ({
        default: module.SettingsIcon,
      })),
  ],
  [
    'Shapes',
    () =>
      import('./icons/shapes').then((module) => ({
        default: module.ShapesIcon,
      })),
  ],
  [
    'ShieldCheck',
    () =>
      import('./icons/shield-check').then((module) => ({
        default: module.ShieldCheckIcon,
      })),
  ],
  [
    'SlidersHorizontal',
    () =>
      import('./icons/sliders-horizontal').then((module) => ({
        default: module.SlidersHorizontalIcon,
      })),
  ],
  [
    'Sparkles',
    () =>
      import('./icons/sparkles').then((module) => ({
        default: module.SparklesIcon,
      })),
  ],
  [
    'SquareActivity',
    () =>
      import('./icons/square-activity').then((module) => ({
        default: module.SquareActivityIcon,
      })),
  ],
  [
    'SquarePen',
    () =>
      import('./icons/square-pen').then((module) => ({
        default: module.SquarePenIcon,
      })),
  ],
  [
    'SquarePlay',
    () =>
      import('./icons/square-play').then((module) => ({
        default: module.SquarePlayIcon,
      })),
  ],
  [
    'Telescope',
    () =>
      import('./icons/telescope').then((module) => ({
        default: module.TelescopeIcon,
      })),
  ],
  [
    'Terminal',
    () =>
      import('./icons/terminal').then((module) => ({
        default: module.TerminalIcon,
      })),
  ],
  [
    'Thermometer',
    () =>
      import('./icons/thermometer').then((module) => ({
        default: module.ThermometerIcon,
      })),
  ],
  [
    'TrendingUp',
    () =>
      import('./icons/trending-up').then((module) => ({
        default: module.TrendingUpIcon,
      })),
  ],
  [
    'Upload',
    () =>
      import('./icons/upload').then((module) => ({
        default: module.UploadIcon,
      })),
  ],
  [
    'User',
    () =>
      import('./icons/user').then((module) => ({ default: module.UserIcon })),
  ],
  [
    'UserCheck',
    () =>
      import('./icons/user-check').then((module) => ({
        default: module.UserCheckIcon,
      })),
  ],
  [
    'UserPlus',
    () =>
      import('./icons/user-plus').then((module) => ({
        default: module.UserPlusIcon,
      })),
  ],
  [
    'UserRoundPlus',
    () =>
      import('./icons/user-round-plus').then((module) => ({
        default: module.UserRoundPlusIcon,
      })),
  ],
  [
    'Users',
    () =>
      import('./icons/users').then((module) => ({ default: module.UsersIcon })),
  ],
  [
    'UsersRound',
    () =>
      import('./icons/users-round').then((module) => ({
        default: module.UsersRoundIcon,
      })),
  ],
  [
    'Wallet',
    () =>
      import('./icons/wallet').then((module) => ({
        default: module.WalletIcon,
      })),
  ],
  [
    'Waypoints',
    () =>
      import('./icons/waypoints').then((module) => ({
        default: module.WaypointsIcon,
      })),
  ],
  [
    'Webhook',
    () =>
      import('./icons/webhook').then((module) => ({
        default: module.WebhookIcon,
      })),
  ],
  [
    'Workflow',
    () =>
      import('./icons/workflow').then((module) => ({
        default: module.WorkflowIcon,
      })),
  ],
  [
    'Wrench',
    () =>
      import('./icons/wrench').then((module) => ({
        default: module.WrenchIcon,
      })),
  ],
  [
    'X',
    () => import('./icons/x').then((module) => ({ default: module.XIcon })),
  ],
  [
    'Zap',
    () => import('./icons/zap').then((module) => ({ default: module.ZapIcon })),
  ],
];

const ANIMATED_ICONS: ReadonlyMap<string, AnimatedIconComponent> = new Map(
  ANIMATED_ICON_LOADERS.map(([name, load]) => [name, lazy(load)]),
);

function iconName(icon: unknown): string | undefined {
  if (
    typeof icon !== 'function' &&
    (typeof icon !== 'object' || icon === null)
  ) {
    return undefined;
  }
  const { displayName } = icon as { displayName?: unknown };
  return typeof displayName === 'string' ? displayName : undefined;
}

/** The animated twin of a Lucide icon component, when one exists. */
export function findAnimatedIcon(
  icon: unknown,
): AnimatedIconComponent | undefined {
  const name = iconName(icon);
  return name ? ANIMATED_ICONS.get(name) : undefined;
}

export const ANIMATED_ICON_COUNT = ANIMATED_ICON_LOADERS.length;
