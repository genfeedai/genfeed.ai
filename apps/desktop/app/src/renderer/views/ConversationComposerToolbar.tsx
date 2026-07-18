import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopPublishIntent,
  IDesktopBrand,
  IDesktopCloudOrganization,
  IDesktopCloudProject,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const PLATFORM_OPTIONS: Array<{
  description: string;
  label: string;
  value: DesktopContentPlatform;
}> = [
  {
    description: 'Fast hooks and threads',
    label: 'Twitter/X',
    value: 'twitter',
  },
  { description: 'Short-form scripts', label: 'TikTok', value: 'tiktok' },
  {
    description: 'Captions and carousels',
    label: 'Instagram',
    value: 'instagram',
  },
  {
    description: 'Founder and GTM posts',
    label: 'LinkedIn',
    value: 'linkedin',
  },
  { description: 'Long-form video angles', label: 'YouTube', value: 'youtube' },
];

const TYPE_OPTIONS: Array<{
  label: string;
  value: DesktopContentType;
}> = [
  { label: 'Hook', value: 'hook' },
  { label: 'Thread', value: 'thread' },
  { label: 'Caption', value: 'caption' },
  { label: 'Script', value: 'script' },
  { label: 'Reply', value: 'reply' },
  { label: 'Article', value: 'article' },
];

const PUBLISH_INTENT_OPTIONS: Array<{
  label: string;
  value: DesktopPublishIntent;
}> = [
  { label: 'Save for review', value: 'review' },
  { label: 'Create as draft', value: 'draft' },
  { label: 'Publish after generate', value: 'publish' },
];

const UNLINKED_PROJECT_VALUE = '__not_linked__';
const UNLINKED_BRAND_VALUE = '__no_cloud_brand__';

type ConversationComposerToolbarProps = {
  contentType: DesktopContentType;
  input: string;
  isCloudConnected: boolean;
  onContentTypeChange: (value: DesktopContentType) => void;
  onBrandLink: (brandId: string, organizationId?: string) => Promise<void>;
  onImportAssets: () => Promise<void>;
  onPlatformChange: (value: DesktopContentPlatform) => void;
  onProjectLink: (projectId: string) => Promise<void>;
  onPublishIntentChange: (value: DesktopPublishIntent) => void;
  onSaveDraft: () => Promise<void>;
  platform: DesktopContentPlatform;
  brands: IDesktopBrand[];
  cloudOrganizations: IDesktopCloudOrganization[];
  projects: IDesktopCloudProject[];
  publishIntent: DesktopPublishIntent;
  workspace: IDesktopWorkspace | null;
  workspaceId: string | null;
};

export function ConversationComposerToolbar({
  contentType,
  input,
  isCloudConnected,
  brands,
  cloudOrganizations,
  onContentTypeChange,
  onBrandLink,
  onImportAssets,
  onPlatformChange,
  onProjectLink,
  onPublishIntentChange,
  onSaveDraft,
  platform,
  projects,
  publishIntent,
  workspace,
  workspaceId,
}: ConversationComposerToolbarProps) {
  const cloudOrgNamesById = new Map(
    cloudOrganizations.map((organization) => [
      organization.cloudId,
      organization.name,
    ]),
  );

  return (
    <div className="composer-toolbar panel-card">
      <div className="composer-control-group">
        <label className="composer-label" htmlFor="desktop-platform">
          Platform
        </label>
        <Select
          onValueChange={(value) =>
            onPlatformChange(value as DesktopContentPlatform)
          }
          value={platform}
        >
          <SelectTrigger id="desktop-platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="composer-control-group">
        <label className="composer-label" htmlFor="desktop-content-type">
          Output
        </label>
        <Select
          onValueChange={(value) =>
            onContentTypeChange(value as DesktopContentType)
          }
          value={contentType}
        >
          <SelectTrigger id="desktop-content-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="composer-control-group">
        <label className="composer-label" htmlFor="desktop-publish-intent">
          Intent
        </label>
        <Select
          onValueChange={(value) =>
            onPublishIntentChange(value as DesktopPublishIntent)
          }
          value={publishIntent}
        >
          <SelectTrigger id="desktop-publish-intent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLISH_INTENT_OPTIONS.map((option) => (
              <SelectItem
                disabled={option.value === 'publish' && !isCloudConnected}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="composer-control-group composer-project-group">
        <label className="composer-label" htmlFor="desktop-brand-link">
          Cloud brand
        </label>
        <Select
          onValueChange={(value) => {
            if (value === UNLINKED_BRAND_VALUE) {
              void onBrandLink('');
              return;
            }

            const brand = brands.find((item) => item.id === value);
            void onBrandLink(
              brand?.cloudId ?? value,
              brand?.cloudOrganizationId,
            );
          }}
          value={
            workspace?.linkedBrandId
              ? (brands.find(
                  (brand) =>
                    brand.cloudId === workspace.linkedBrandId ||
                    brand.id === workspace.linkedBrandId,
                )?.id ?? workspace.linkedBrandId)
              : UNLINKED_BRAND_VALUE
          }
        >
          <SelectTrigger id="desktop-brand-link">
            <SelectValue placeholder="Local only" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNLINKED_BRAND_VALUE}>Local only</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.cloudOrganizationId
                  ? `${brand.name} - ${
                      cloudOrgNamesById.get(brand.cloudOrganizationId) ??
                      brand.cloudOrganizationId
                    }`
                  : brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="composer-control-group composer-project-group">
        <label className="composer-label" htmlFor="desktop-project-link">
          Cloud project
        </label>
        <Select
          onValueChange={(value) =>
            void onProjectLink(value === UNLINKED_PROJECT_VALUE ? '' : value)
          }
          value={workspace?.linkedProjectId ?? UNLINKED_PROJECT_VALUE}
        >
          <SelectTrigger id="desktop-project-link">
            <SelectValue placeholder="Not linked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNLINKED_PROJECT_VALUE}>Not linked</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        className="small"
        disabled={!workspaceId || !input.trim()}
        onClick={() => void onSaveDraft()}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        Save draft
      </Button>
      <Button
        className="small"
        disabled={!workspaceId}
        onClick={() => void onImportAssets()}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        Import assets
      </Button>
    </div>
  );
}
