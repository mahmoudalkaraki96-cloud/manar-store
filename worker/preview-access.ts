export interface PreviewAccessEnv {
  PREVIEW_ACCESS_TEAM?: string;
  PREVIEW_ACCESS_AUD?: string;
  PREVIEW_ALLOWED_EMAILS?: string;
}
function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function previewIdentity(request: Request, env: PreviewAccessEnv, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const team = env.PREVIEW_ACCESS_TEAM, audience = env.PREVIEW_ACCESS_AUD;
    const allowed = (env.PREVIEW_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!team || !/^[a-z0-9-]+$/.test(team) || !audience || !allowed.length) return null;
    const token = request.headers.get('cf-access-jwt-assertion') || (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('CF_Authorization='))?.slice(17);
    if (!token || token.length > 12000) return null;
    const parts = token.split('.'); if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))), claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.iss !== `https://${team}.cloudflareaccess.com`
      || !Array.isArray(claims.aud) || !claims.aud.includes(audience) || typeof claims.exp !== 'number' || claims.exp <= now
      || typeof claims.iat !== 'number' || claims.iat > now + 30 || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + 30))
      || typeof claims.email !== 'string' || !allowed.includes(claims.email.toLowerCase())) return null;
    const response = await fetcher(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`, { redirect: 'manual' });
    if (!response.ok) return null;
    const data = await response.json() as { keys?: (JsonWebKey & { kid?: string })[] };
    const jwk = data.keys?.find(key => key.kid === header.kid && key.kty === 'RSA'); if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) return null;
    return claims.email.toLowerCase();
  } catch { return null; }
}
