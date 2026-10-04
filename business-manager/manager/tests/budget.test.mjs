import test from 'node:test';import assert from 'node:assert/strict';import {usageCost,RESERVATION,monthKey} from '../lib/budget.mjs';
test('usage cost rounds up and ignores cached discount conservatively',()=>assert.equal(usageCost({input_tokens:3000,output_tokens:300}),1680));
test('unknown usage cannot silently become zero',()=>{for(const u of [undefined,{}, {input_tokens:-1,output_tokens:3}])assert.throws(()=>usageCost(u));});
test('reservation covers three bounded requests with margin',()=>assert.ok(RESERVATION>3*(20000*.4+1400*1.6)));
test('month uses Hebron rather than UTC boundary',()=>assert.match(monthKey(new Date('2026-09-30T22:30:00Z')),/2026.*10|10.*2026/));
