import {test} from 'node:test';import assert from 'node:assert/strict';import {accessError} from '../lib/access.mjs';
const authenticated={'oai-authenticated-user-id':'test','oai-authenticated-user-email':'test@example.com',origin:'https://example.com'};
test('anonymous denied',()=>assert.equal(accessError(new Request('https://example.com/api')).status,401));
test('cross origin mutation denied',()=>assert.equal(accessError(new Request('https://example.com/api',{headers:{...authenticated,origin:'https://other.com'}}),{write:true,business:'manar'}).status,403));
test('inactive business write denied',()=>assert.equal(accessError(new Request('https://example.com/api',{headers:authenticated}),{write:true,business:'business2'}).status,403));
test('unknown business denied',()=>assert.equal(accessError(new Request('https://example.com/api',{headers:authenticated}),{business:'unknown'}).status,400));
test('active authorized write allowed',()=>assert.equal(accessError(new Request('https://example.com/api',{headers:authenticated}),{write:true,business:'manar'}),null));
