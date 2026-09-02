/**
 * Admin Commands Registry
 * Navigation commands for the admin panel command palette
 */

import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { EnvironmentService } from '@services/core/environment.service';
import {
  ChartColumn,
  ClipboardList,
  Cpu,
  CreditCard,
  FileText,
  House as Home,
  Image,
  MessageSquare,
  Newspaper,
  Paintbrush,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  Video,
  Volume2,
} from 'lucide-react';

function navigate(url: string): void {
  window.location.href = url;
}

const adminCondition = () => EnvironmentService.currentApp === 'admin';

export const adminNavigationCommands: ICommand[] = [
  // Cross-app: Go to App
  {
    action: () => {
      navigate(EnvironmentService.apps.app);
    },
    category: 'navigation',
    condition: adminCondition,
    description: 'Switch to the main app',
    icon: Paintbrush,
    id: 'admin-nav-app',
    keywords: ['app', 'studio', 'main'],
    label: 'Go to App',
    priority: 10,
  },
  // OVERVIEW
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/overview/dashboard`);
    },
    category: 'navigation',
    condition: adminCondition,
    description: 'Admin overview',
    icon: Home,
    id: 'admin-nav-dashboard',
    keywords: ['dashboard', 'home', 'overview'],
    label: 'Overview',
    priority: 10,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/overview/analytics`);
    },
    category: 'navigation',
    condition: adminCondition,
    description: 'Platform analytics',
    icon: ChartColumn,
    id: 'admin-nav-analytics',
    keywords: ['analytics', 'stats', 'metrics'],
    label: 'Analytics',
    priority: 9,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/overview/activities`);
    },
    category: 'navigation',
    condition: adminCondition,
    description: 'Recent platform activities',
    icon: ClipboardList,
    id: 'admin-nav-activities',
    keywords: ['activities', 'logs', 'recent'],
    label: 'Activities',
    priority: 8,
  },
  // CONTENT
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/content/posts`);
    },
    category: 'content',
    condition: adminCondition,
    description: 'Manage all posts',
    icon: Newspaper,
    id: 'admin-nav-posts',
    keywords: ['posts', 'content', 'articles'],
    label: 'Posts',
    priority: 8,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/content/templates`);
    },
    category: 'content',
    condition: adminCondition,
    description: 'Manage content templates',
    icon: FileText,
    id: 'admin-nav-templates',
    keywords: ['templates', 'content'],
    label: 'Templates',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/content/prompts`);
    },
    category: 'content',
    condition: adminCondition,
    description: 'Manage AI prompts',
    icon: FileText,
    id: 'admin-nav-prompts',
    keywords: ['prompts', 'ai', 'content'],
    label: 'Prompts',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/content/ingredients`);
    },
    category: 'content',
    condition: adminCondition,
    description: 'Manage content ingredients',
    icon: Image,
    id: 'admin-nav-ingredients',
    keywords: ['ingredients', 'assets', 'media'],
    label: 'Ingredients',
    priority: 7,
  },
  // AI & AUTOMATION
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/automation/models`);
    },
    category: 'automation',
    condition: adminCondition,
    description: 'Manage AI models',
    icon: Cpu,
    id: 'admin-nav-models',
    keywords: ['models', 'ai', 'machine learning'],
    label: 'Models',
    priority: 9,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/automation/trainings`);
    },
    category: 'automation',
    condition: adminCondition,
    description: 'Manage model trainings',
    icon: Cpu,
    id: 'admin-nav-trainings',
    keywords: ['trainings', 'lora', 'fine-tune'],
    label: 'Trainings',
    priority: 8,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/automation/bots`);
    },
    category: 'automation',
    condition: adminCondition,
    description: 'Manage automation bots',
    icon: Cpu,
    id: 'admin-nav-bots',
    keywords: ['bots', 'automation'],
    label: 'Bots',
    priority: 8,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/automation/workflows`);
    },
    category: 'automation',
    condition: adminCondition,
    description: 'Manage workflows',
    icon: ClipboardList,
    id: 'admin-nav-workflows',
    keywords: ['workflows', 'automation'],
    label: 'Workflows',
    priority: 8,
  },
  // CONFIGURATION
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/configuration/elements`);
    },
    category: 'configuration',
    condition: adminCondition,
    description: 'Manage UI elements',
    icon: Tag,
    id: 'admin-nav-elements',
    keywords: ['elements', 'ui', 'components'],
    label: 'Elements',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/configuration/presets`);
    },
    category: 'configuration',
    condition: adminCondition,
    description: 'Manage configuration presets',
    icon: FileText,
    id: 'admin-nav-presets',
    keywords: ['presets', 'configuration'],
    label: 'Presets',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/configuration/font-families`);
    },
    category: 'configuration',
    condition: adminCondition,
    description: 'Manage font families',
    icon: Settings,
    id: 'admin-nav-font-families',
    keywords: ['fonts', 'typography', 'font families'],
    label: 'Font Families',
    priority: 6,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/configuration/tags`);
    },
    category: 'configuration',
    condition: adminCondition,
    description: 'Manage tags',
    icon: Tag,
    id: 'admin-nav-tags',
    keywords: ['tags', 'labels', 'categories'],
    label: 'Tags',
    priority: 6,
  },
  // ADMINISTRATION
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/administration/users`);
    },
    category: 'administration',
    condition: adminCondition,
    description: 'Manage platform users',
    icon: Users,
    id: 'admin-nav-users',
    keywords: ['users', 'accounts', 'members'],
    label: 'Users',
    priority: 9,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/administration/roles`);
    },
    category: 'administration',
    condition: adminCondition,
    description: 'Manage user roles and permissions',
    icon: ShieldCheck,
    id: 'admin-nav-roles',
    keywords: ['roles', 'permissions', 'access'],
    label: 'Roles',
    priority: 8,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/administration/subscriptions`);
    },
    category: 'administration',
    condition: adminCondition,
    description: 'Manage subscriptions and billing',
    icon: CreditCard,
    id: 'admin-nav-subscriptions',
    keywords: ['subscriptions', 'billing', 'plans'],
    label: 'Subscriptions',
    priority: 8,
  },
  // FLEET
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/characters`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Manage AI characters',
    icon: Users,
    id: 'admin-nav-characters',
    keywords: ['characters', 'personas', 'influencers'],
    label: 'Characters',
    priority: 8,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/gallery`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Browse generated content',
    icon: Image,
    id: 'admin-nav-gallery',
    keywords: ['gallery', 'images', 'generated'],
    label: 'Gallery',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/training`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Manage LoRA training',
    icon: Cpu,
    id: 'admin-nav-fleet-training',
    keywords: ['training', 'lora', 'fleet'],
    label: 'Fleet Training',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/pipeline`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Manage generation pipeline',
    icon: ClipboardList,
    id: 'admin-nav-pipeline',
    keywords: ['pipeline', 'generation', 'queue'],
    label: 'Pipeline',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/generate`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Generate AI content',
    icon: Image,
    id: 'admin-nav-generate',
    keywords: ['generate', 'create', 'fleet'],
    label: 'Generate',
    priority: 7,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/lip-sync`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Lip sync video generation',
    icon: Video,
    id: 'admin-nav-lip-sync',
    keywords: ['lip sync', 'video', 'talking head'],
    label: 'Lip Sync',
    priority: 6,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/voices`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Manage AI voices',
    icon: Volume2,
    id: 'admin-nav-voices',
    keywords: ['voices', 'tts', 'audio', 'speech'],
    label: 'Voices',
    priority: 6,
  },
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/fleet/infrastructure`);
    },
    category: 'fleet',
    condition: adminCondition,
    description: 'Manage GPU infrastructure',
    icon: Settings,
    id: 'admin-nav-infrastructure',
    keywords: ['infrastructure', 'gpu', 'servers'],
    label: 'Infrastructure',
    priority: 6,
  },
  // MARKETPLACE
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/marketplace`);
    },
    category: 'administration',
    condition: adminCondition,
    description: 'Marketplace moderation and operations',
    icon: Newspaper,
    id: 'admin-nav-marketplace',
    keywords: ['marketplace', 'listings', 'sellers', 'sales', 'payouts'],
    label: 'Marketplace',
    priority: 7,
  },
  // AGENT
  {
    action: () => {
      navigate(`${EnvironmentService.apps.admin}/agent`);
    },
    category: 'navigation',
    condition: adminCondition,
    description: 'Open AI agent chat',
    icon: MessageSquare,
    id: 'admin-nav-agent',
    keywords: ['agent', 'chat', 'ai', 'assistant'],
    label: 'Agent',
    priority: 9,
  },
];

/**
 * Register all admin navigation commands
 */
export function registerAdminNavigationCommands(): void {
  const {
    CommandPaletteService,
  } = require('@services/core/command-palette.service');
  CommandPaletteService.registerCommands(adminNavigationCommands);
}
