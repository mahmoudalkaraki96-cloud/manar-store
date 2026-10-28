const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('worker/admin-permissions.ts', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports: {}};
new Function('module', 'exports', compiled)(mod, mod.exports);
const {effectivePermissions, hasPermission} = mod.exports;

test('permissions combine group and direct grants without duplicates', () => {
  const grants = effectivePermissions([['orders.read'], ['products.write', 'orders.read']], ['customers.read']);
  assert.deepEqual([...grants].sort(), ['customers.read', 'orders.read', 'products.write']);
  assert.equal(hasPermission(grants, 'orders.delete'), false);
});

test('unknown and empty grants do not grant access', () => {
  const grants = effectivePermissions([['*', 'users.manage.extra']], []);
  assert.equal(grants.size, 0);
  assert.equal(hasPermission(grants, 'users.manage'), false);
});

