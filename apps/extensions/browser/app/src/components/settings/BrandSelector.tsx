import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';
import { useBrandVoice } from '~hooks/use-brand-voice';
import { selectWorkspaceBrand } from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

export function BrandSelector(): ReactElement {
  const brands = useBrandStore((s) => s.brands);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  useBrandVoice();
  const workspace = useWorkspaceStore();

  function handleChange(value: string) {
    void selectWorkspaceBrand(value || null).catch(() => undefined);
  }

  if (brands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No brands found. Create a brand in Genfeed Studio.
      </p>
    );
  }

  return (
    <Select
      disabled={workspace.status !== 'ready'}
      value={activeBrandId ?? ''}
      onValueChange={handleChange}
    >
      <SelectTrigger
        aria-label="Active brand"
        className="h-8 w-full border-0 bg-transparent text-xs shadow-none"
      >
        <SelectValue placeholder="Select a brand..." />
      </SelectTrigger>
      <SelectContent>
        {brands.map((brand) => (
          <SelectItem key={brand.id} value={brand.id}>
            {brand.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
