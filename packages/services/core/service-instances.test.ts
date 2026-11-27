import { HTTPBaseService } from '@services/core/interceptor.service';
import { describe, expect, it } from 'vitest';

type ServiceConstructor = (new (
  token: string,
) => HTTPBaseService) & {
  getInstance: (token: string) => HTTPBaseService;
};

const modules = import.meta.glob<Record<string, unknown>>(
  ['../**/*.service.ts', '!../**/*.test.ts'],
  { eager: true },
);

function isDataService(value: unknown): value is ServiceConstructor {
  return (
    typeof value === 'function' &&
    value.prototype instanceof HTTPBaseService &&
    Object.hasOwn(value, 'getInstance') &&
    // One argument: the token. Others need an organization or take none.
    (value as ServiceConstructor).getInstance.length === 1
  );
}

const dataServices = Object.entries(modules).flatMap(([file, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => isDataService(value))
    .map(([name, value]) => [`${file} ${name}`, value as ServiceConstructor]),
) as Array<[string, ServiceConstructor]>;

describe('data service instances', () => {
  it('finds the data services of the package', () => {
    expect(dataServices.length).toBeGreaterThan(50);
  });

  it.each(dataServices)(
    '%s hands out one instance of its own class per token',
    (_name, Service) => {
      const first = Service.getInstance('instance-token-a');

      expect(first).toBeInstanceOf(Service);
      expect(Service.getInstance('instance-token-a')).toBe(first);
      expect(Service.getInstance('instance-token-b')).not.toBe(first);
    },
  );
});
