'use client';

import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import {
  type AdminModelsFiltersProps,
  resolveAdminModelFilters,
} from '@props/admin/models.props';
import MultiSelectDropdown from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminModelsFilters({
  category,
}: AdminModelsFiltersProps) {
  const params = useSearchParams();
  const { replace } = useRouter();
  const filters = resolveAdminModelFilters(
    new URLSearchParams(params.toString()),
    category,
  );
  function handleChange(name: string, values: string[]) {
    const next = new URLSearchParams(params.toString());
    // Materialize legacy type links before switching to independent filters.
    next.delete('type');
    next.delete('category');
    next.delete('provider');
    next.delete('status');
    for (const [key, selected] of Object.entries({
      category: filters.categories,
      provider: filters.providers,
      status: filters.statuses,
    })) {
      const entries = key === name ? values : selected;
      if (key === 'status' && entries.length === 0) next.set('status', 'all');
      else for (const value of entries) next.append(key, value);
    }
    next.delete('page');
    replace(`${APP_ROUTES.ADMIN.AUTOMATION.MODELS}?${next.toString()}`, {
      scroll: false,
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        name="category"
        placeholder="All categories"
        values={filters.categories}
        options={Object.values(ModelCategory).map((value) => ({
          value,
          label: value
            .replaceAll('-', ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        }))}
        onChange={handleChange}
      />
      <MultiSelectDropdown
        name="provider"
        placeholder="All providers"
        values={filters.providers}
        options={Object.values(ModelProvider).map((value) => ({
          value,
          label: getModelProviderLabel(value),
        }))}
        onChange={handleChange}
      />
      <MultiSelectDropdown
        name="status"
        placeholder="All statuses"
        values={filters.statuses}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        onChange={handleChange}
      />
    </div>
  );
}
