import { useMemo, useRef } from 'react';

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
  // Callers often pass an inline `filterFields` arrow. Depending on that
  // identity forces a new filtered array every render even when `data` and
  // `filter` are stable — and any consumer that setStates from the result loops.
  const filterFieldsRef = useRef(filterFields);
  filterFieldsRef.current = filterFields;

  const filteredData = useMemo(() => {
    if (!filter) {
      return data;
    }

    const searchTerm = filter.toLowerCase();

    return data.filter((item) => {
      const fields = filterFieldsRef.current(item);
      return fields.some((field) => field?.toLowerCase().includes(searchTerm));
    });
  }, [data, filter]);

  return filteredData;
}
