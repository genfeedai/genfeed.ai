import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { activateWorkspace } from '~services/workspace.service';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function OrganizationSelector() {
  const workspace = useWorkspaceStore();
  return (
    <Select
      value={
        workspace.status === 'ready' ? workspace.snapshot.organizationId : ''
      }
      disabled={workspace.status !== 'ready' || workspace.snapshot.isApiKey}
      onValueChange={(id) => {
        void activateWorkspace(id).catch(() => undefined);
      }}
    >
      <SelectTrigger
        aria-label="Active organization"
        className="h-8 w-full text-xs"
      >
        <SelectValue placeholder="Loading workspace..." />
      </SelectTrigger>
      <SelectContent>
        {workspace.status === 'ready' &&
          workspace.snapshot.organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              {organization.label}
              {workspace.snapshot.organizations.filter(
                (item) => item.label === organization.label,
              ).length > 1
                ? ` (${organization.slug})`
                : ''}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
