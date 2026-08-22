interface CloudflareEnvBinding {
  prepare(query: string): unknown;
}
declare module "cloudflare:workers" {
  export const env: { DB: CloudflareEnvBinding };
}
