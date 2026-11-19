import { posix } from 'node:path';

export function appRequestUrl(endpoint: string, relative: string) {
  if (
    !relative ||
    relative.length > 2048 ||
    relative.startsWith('//') ||
    relative.includes('\\') ||
    relative.includes('#')
  )
    throw new Error('Use a path in the saved API address.');
  const base = new URL(endpoint);
  const url = new URL(
    relative.startsWith('/') ? `.${relative}` : relative,
    base.href.endsWith('/') ? base : `${base.href}/`,
  );
  if (/%(?:2e|2f|5c|25)/i.test(url.pathname) || /%(?:2e|2f|5c|25)/i.test(base.pathname))
    throw new Error('The request must stay in the saved API address.');
  const saved = posix.normalize(decodeURIComponent(base.pathname));
  const requested = posix.normalize(decodeURIComponent(url.pathname));
  if (
    url.origin !== base.origin ||
    !requested.startsWith(saved.endsWith('/') ? saved : `${saved}/`)
  )
    throw new Error('The request must stay in the saved API address.');
  return url.href;
}

export function appRequestHeaders(path: { auth: string; apiKeyHeader?: string }, token: string) {
  return path.auth === 'x-api-key'
    ? { [path.apiKeyHeader ?? 'X-API-Key']: token }
    : { Authorization: `Bearer ${token}` };
}
