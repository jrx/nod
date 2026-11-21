import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { apps } from '../../../../data/apps';

export function getStaticPaths() {
  return apps.flatMap((app) =>
    ['icon.png', 'social.png'].map((asset) => ({ params: { app: app.slug, asset } })),
  );
}

const escape = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (value) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[value]!,
  );

export const GET: APIRoute = async ({ params }) => {
  const app = apps.find((app) => app.slug === params.app)!;
  const icon = app.icon
    ? await sharp(
        app.icon.slice(0, app.icon.indexOf(',')).endsWith(';base64')
          ? Buffer.from(app.icon.slice(app.icon.indexOf(',') + 1), 'base64')
          : Buffer.from(decodeURIComponent(app.icon.slice(app.icon.indexOf(',') + 1))),
      )
        .resize(120, 120, { fit: 'contain' })
        .png()
        .toBuffer()
    : undefined;
  if (params.asset === 'icon.png')
    return new Response(
      new Uint8Array(
        icon ??
          (await sharp({ create: { width: 120, height: 120, channels: 4, background: '#ff91ac' } })
            .png()
            .toBuffer()),
      ),
      { headers: { 'Content-Type': 'image/png' } },
    );
  const lines = app.description.match(/.{1,58}(?:\s|$)|.{1,58}/g)?.slice(0, 3) ?? [
    app.description.slice(0, 58),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#191919"/><rect x="56" y="56" width="1088" height="518" rx="24" fill="#242424" stroke="#464646"/><text x="100" y="124" font-family="Arial,sans-serif" font-size="23" letter-spacing="4" fill="#ff91ac">NOD / APPS</text>${icon ? `<rect x="990" y="94" width="108" height="108" rx="20" fill="#fafafa"/><image x="1004" y="108" width="80" height="80" href="data:image/png;base64,${icon.toString('base64')}"/>` : ''}<text x="100" y="282" font-family="Arial,sans-serif" font-size="${app.name.length > 20 ? 50 : 70}" font-weight="700" fill="#fafafa">${escape(app.name.slice(0, 32))}</text>${lines.map((line, index) => `<text x="100" y="${352 + index * 38}" font-family="Arial,sans-serif" font-size="27" fill="#bfbfbf">${escape(line.trim())}</text>`).join('')}<text x="100" y="526" font-family="Arial,sans-serif" font-size="22" fill="#ff91ac">Your apps. Your assistant.</text><text x="1096" y="526" text-anchor="end" font-family="Arial,sans-serif" font-size="20" fill="#bfbfbf">nod.n8n.io</text></svg>`;
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } });
};
