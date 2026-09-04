import { AppError } from '../lib/http.js';

export function createUnavailableService(name) {
  const dependency = String(name || 'dependency');
  const fail = async () => {
    throw new AppError(
      503,
      'DEPENDENCY_NOT_CONFIGURED',
      `${dependency} is not configured for core staging`
    );
  };

  return new Proxy(
    { kind: 'unavailable', status: 'unavailable', dependency },
    {
      get(target, property) {
        if (property in target) return target[property];
        if (typeof property === 'symbol') return undefined;
        return fail;
      }
    }
  );
}
