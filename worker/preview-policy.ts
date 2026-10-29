export const PREVIEW_ORIGIN = 'https://manarstore.ps';
const APIs = new Set(['/api/catalog', '/api/storefront', '/api/policies', '/api/shipping-zones']);
export function previewRoute(request: Request): 'blocked' | 'proxy' | 'app' | 'status' | 'robots' {
  const url = new URL(request.url), pathname = url.pathname;
  if (!['GET', 'HEAD'].includes(request.method)) return 'blocked';
  if (pathname === '/__preview/status') return 'status';
  if (pathname === '/robots.txt') return 'robots';
  if (pathname.includes('\\') || /%2f|%5c|%00/i.test(pathname)) return 'blocked';
  if (APIs.has(pathname) || pathname.startsWith('/media/') || pathname.startsWith('/product-images/') || pathname === '/_media/thumbnail') return 'proxy';
  if (pathname.startsWith('/api/') || /^\/(admin|account)(\/|$)/.test(pathname) || /(?:^|\/)(?:sw|service-worker)\.js$/.test(pathname) || /manifest/i.test(pathname)) return 'blocked';
  if (pathname === '/' || pathname === '/search' || /^\/(category|product|products|policies)\/[^/]+\/?$/.test(pathname) || pathname === '/privacy'
    || pathname.startsWith('/_vinext/') || pathname.startsWith('/assets/') || pathname.startsWith('/_next/') || /^\/(favicon|og|icon|apple-icon)[^/]*\.(png|ico|svg|webp)$/.test(pathname)) return 'app';
  return 'blocked';
}
export function previewTarget(request: Request): URL {
  const source = new URL(request.url), target = new URL(source.pathname, PREVIEW_ORIGIN);
  // Query parameters cannot switch the origin or request inactive/admin data.
  if (source.pathname === '/_media/thumbnail') {
    const src = source.searchParams.get('src') || '', width = source.searchParams.get('width') || '';
    if (!/^\/(media|product-images)\//.test(src) || src.includes('\\') || !['256', '384', '640'].includes(width)) throw new Error('Invalid thumbnail');
    const image = new URL(src, PREVIEW_ORIGIN); if (image.origin !== PREVIEW_ORIGIN) throw new Error('Invalid thumbnail origin');
    target.searchParams.set('src', image.pathname); target.searchParams.set('width', width);
  }
  return target;
}
export function previewHeaders(original?: HeadersInit): Headers {
  const headers = new Headers(original);
  headers.delete('set-cookie'); headers.delete('content-length'); headers.delete('content-encoding');
  headers.set('cache-control', 'private, no-store'); headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('x-content-type-options', 'nosniff'); headers.set('x-frame-options', 'DENY'); headers.set('referrer-policy', 'no-referrer');
  headers.set('x-store-preview', 'read-only');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; worker-src 'none'");
  return headers;
}
