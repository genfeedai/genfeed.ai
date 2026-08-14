const NEST_BOOTSTRAP_NOISE_SERVICES = new Set([
  'RouterExplorer',
  'RoutesResolver',
]);

export function shouldDropLoggerInfo(info: {
  message?: unknown;
  service?: unknown;
}): boolean {
  return (
    typeof info.service === 'string' &&
    NEST_BOOTSTRAP_NOISE_SERVICES.has(info.service)
  );
}
