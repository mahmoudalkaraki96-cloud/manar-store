import handler from 'vinext/server/app-router-entry';
import { previewIdentity, type PreviewAccessEnv } from './preview-access';
import { previewRoute, previewTarget, previewHeaders } from './preview-policy';

interface PreviewEnv extends PreviewAccessEnv { ASSETS: { fetch(request: Request): Promise<Response> }; PREVIEW_REVISION?: string }
export default {
  async fetch(request: Request, env: PreviewEnv, ctx: Parameters<typeof handler.fetch>[2]): Promise<Response> {
    const respond = (body: BodyInit | null, status = 200, headers?: HeadersInit) => new Response(request.method === 'HEAD' ? null : body, { status, headers: previewHeaders(headers) });
    if (!await previewIdentity(request, env)) return respond('Private preview: sign in with the authorized Cloudflare account.', 401, { 'content-type': 'text/plain; charset=utf-8' });
    const route = previewRoute(request);
    if (route === 'blocked') return respond('هذه نسخة معاينة للقراءة فقط. تنفيذ الطلبات والحسابات والإشعارات غير متاح.', 403, { 'content-type': 'text/plain; charset=utf-8' });
    if (route === 'status') return respond(JSON.stringify({ mode: 'read-only', revision: env.PREVIEW_REVISION || 'unpublished', databaseBindings: false, orderSubmission: false }), 200, { 'content-type': 'application/json' });
    if (route === 'robots') return respond('User-agent: *\nDisallow: /\n', 200, { 'content-type': 'text/plain' });
    if (route === 'proxy') {
      try {
        // No cookies, authorization headers, identity, IP header or request body cross to production.
        const response = await fetch(previewTarget(request), { method: request.method, redirect: 'manual', headers: { accept: 'application/json,image/*,*/*;q=0.5' } });
        if (!response.ok) return respond('Public preview data is temporarily unavailable.', 502);
        return respond(response.body, response.status, response.headers);
      } catch { return respond('Preview data unavailable.', 502); }
    }
    const response = await handler.fetch(request, env, ctx);
    if (!response.headers.get('content-type')?.includes('text/html')) return respond(response.body, response.status, response.headers);
    const html = await response.text();
    const banner = '<div role="status" style="position:sticky;top:0;z-index:2147483647;background:#fff3cd;color:#513d00;padding:8px;text-align:center;font:14px sans-serif" dir="rtl">نسخة معاينة خاصة — الطلبات والإشعارات والتسجيل معطّلة</div>';
    return respond(html.replace(/<body([^>]*)>/i, '<body$1>' + banner), response.status, response.headers);
  },
};
