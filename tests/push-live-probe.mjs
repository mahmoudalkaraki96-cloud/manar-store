import assert from 'node:assert/strict';
const origin='https://manarstore.ps';
const response=await fetch(origin+'/api/push/config');assert.equal(response.status,200);
const config=await response.json();assert.equal(Buffer.from(config.publicKey,'base64url').length,65);assert.equal(config.private_jwk,undefined);
for(const path of ['/sw.js','/admin-sw.js']){const response=await fetch(origin+path);assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes('addEventListener("push"'));assert.ok(text.includes('notificationclick'))}
// Floating buttons wait for browser-local visibility preferences after hydration.
// The restore/settings entry remains available in server-rendered HTML.
const page=await fetch(origin+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('إعدادات أزرار الشاشة'));
console.log('Live notification config, both service workers and floating button settings entry verified.');
