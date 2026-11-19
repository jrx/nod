import { loopbackHost } from '../shared/loopback.ts';
import { appPagePath, appPages, appPageUrl } from '../shared/app-links.ts';

export function channelText(text: string) {
  let secureAction = false;
  let artifact = false;
  const privateUrl = (value: string) => {
    let url: URL;
    try {
      url = new URL(value, 'https://nod.invalid');
    } catch {
      try {
        url = new URL(
          value.replace(/[\p{Terminal_Punctuation}\p{Pf}\p{Pe}'"\x60]+$/u, ''),
          'https://nod.invalid',
        );
      } catch {
        return false;
      }
    }
    if (url.pathname.startsWith('/api/artifacts/')) {
      artifact = true;
      return true;
    }
    if (loopbackHost(url.hostname.replace(/\.$/u, ''))) {
      secureAction = true;
      return true;
    }
    if (
      /^\/(?:vault|credentials|payments|approvals)\//.test(url.pathname) ||
      url.pathname === '/browser' ||
      (['/vault', '/trust'].includes(url.pathname) && url.searchParams.has('add'))
    ) {
      if (!/^https?:\/\//.test(value)) {
        secureAction = true;
        return true;
      }
    }
    return false;
  };
  const safe = text
    .replace(
      /\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,
      (match, label: string, url: string) => {
        const path = appPagePath(url);
        if (path) {
          const page = appPages[path as keyof typeof appPages];
          return `${page && label !== page ? `${label} (${page})` : label}: ${appPageUrl(path)}`;
        }
        return privateUrl(url) ? label : match;
      },
    )
    .replace(
      /https?:\/\/[^\s)]+|\/(?:api\/artifacts|vault|trust|browser|credentials|payments|approvals)[^\s)]*/g,
      (url) => (privateUrl(url) ? '' : url),
    );
  return { text: safe.trim(), secureAction, artifact };
}
