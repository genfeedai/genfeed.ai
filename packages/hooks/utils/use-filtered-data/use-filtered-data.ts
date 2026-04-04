import { useMemo } from 'react';

export interface UseFilteredDataOptions<T> {
  data: T[];
  filter: string;
  filterFields: (item: T) => (string | undefined)[];
}

export function useFilteredData<T>({
  data,
  filter,
  filterFields,
}: UseFilteredDataOptions<T>) {
  const filteredData = useMemo(() => {
    if (!filter) {
      return data;
    }

    const searchTerm = filter.toLowerCase();

    return data.filter((item) => {
      const fields = filterFields(item);
      return fields.some((field) => field?.toLowerCase().includes(searchTerm));
    });
  }, [data, filter, filterFields]);

  return filteredData;
}
