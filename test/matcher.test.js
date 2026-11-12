import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveOpenUrl,
  hostMatches,
  matchUrl,
  normalizeMatchInput,
  parseHttpUrl,
  splitUrl,
} from '../src/shared/matcher.js';

test('host matching includes subdomains but not lookalikes', () => {
  assert.ok(matchUrl('https://zhihu.com/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(matchUrl('https://www.zhihu.com/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(matchUrl('https://zhihu.com:8443/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(matchUrl('https://WWW.ZHIHU.COM/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(!matchUrl('https://evilzhihu.com/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(!matchUrl('https://zhihu.com.evil.dev/hot', { type: 'host', value: 'zhihu.com' }));
  assert.ok(hostMatches('a.b.example.com', '*.example.com'));
});

test('host input is normalised from pasted URLs', () => {
  assert.deepEqual(normalizeMatchInput('host', 'https://www.zhihu.com/hot#x'), {
    ok: true,
    type: 'host',
    value: 'www.zhihu.com',
  });
  assert.deepEqual(normalizeMatchInput('host', '*.Example.COM'), {
    ok: true,
    type: 'host',
    value: '*.example.com',
  });
  assert.equal(normalizeMatchInput('host', 'exa mple.com').ok, false);
  assert.equal(normalizeMatchInput('host', 'ftp://example.com').ok, false);
});

test('glob treats * as a single path segment and ** as anything', () => {
  const oneStar = { type: 'glob', value: 'https://example.com/*' };
  assert.ok(matchUrl('https://example.com/a', oneStar));
  assert.ok(!matchUrl('https://example.com/a/b', oneStar));

  const twoStar = { type: 'glob', value: 'https://example.com/**' };
  assert.ok(matchUrl('https://example.com/a/b?x=1', twoStar));

  const subdomain = { type: 'glob', value: '*://*.example.com/app/*' };
  assert.ok(matchUrl('https://a.example.com/app/1', subdomain));
  assert.ok(!matchUrl('https://example.com/app/1', subdomain));
  assert.ok(!matchUrl('https://a.example.com/other/1', subdomain));
});

test('glob origin is case-insensitive, path is case-sensitive', () => {
  assert.ok(matchUrl('https://example.com/a', { type: 'glob', value: 'HTTPS://EXAMPLE.COM/a' }));
  assert.ok(!matchUrl('https://example.com/app/x', { type: 'glob', value: 'https://example.com/App/*' }));
});

test('glob without a path matches any path', () => {
  const glob = { type: 'glob', value: 'https://example.com' };
  assert.ok(matchUrl('https://example.com/anything?q=1', glob));
});

test('regex matches the full URL and tolerates invalid patterns', () => {
  const rule = { type: 'regex', value: '^https://example\\.com/(app|work)/' };
  assert.ok(matchUrl('https://example.com/app/1', rule));
  assert.ok(!matchUrl('https://example.com/blog/1', rule));
  assert.ok(!matchUrl('https://example.com/app/1', { type: 'regex', value: '(' }));
});

test('only http(s) URLs are matched', () => {
  for (const url of [
    'chrome://settings',
    'edge://settings',
    'about:blank',
    'file:///tmp/index.html',
    'chrome-extension://abc/popup.html',
    'not a url',
    '',
  ]) {
    assert.equal(parseHttpUrl(url), null, url);
    assert.ok(!matchUrl(url, { type: 'glob', value: '**' }), url);
  }
});

test('glob validation rejects missing schemes and spaces', () => {
  assert.equal(normalizeMatchInput('glob', 'example.com/**').ok, false);
  assert.equal(normalizeMatchInput('glob', 'https://example.com/**').ok, true);
  assert.equal(normalizeMatchInput('glob', '*://example.com/**').ok, true);
  assert.equal(normalizeMatchInput('glob', 'https://example.com/a b').ok, false);
  assert.equal(normalizeMatchInput('regex', '('.repeat(1)).ok, false);
});

test('splitUrl separates origin from path/query/hash', () => {
  assert.deepEqual(splitUrl('https://example.com/a?b=1#c'), {
    origin: 'https://example.com',
    rest: '/a?b=1#c',
  });
  assert.deepEqual(splitUrl('*://example.com/*'), { origin: '*://example.com', rest: '/*' });
  assert.equal(splitUrl('example.com'), null);
});

test('deriveOpenUrl only produces URLs it can know', () => {
  assert.equal(deriveOpenUrl({ type: 'host', value: 'zhihu.com' }), 'https://zhihu.com/');
  assert.equal(deriveOpenUrl({ type: 'host', value: '*.zhihu.com' }), 'https://zhihu.com/');
  assert.equal(
    deriveOpenUrl({ type: 'glob', value: 'https://example.com/app/**' }),
    'https://example.com/',
  );
  assert.equal(
    deriveOpenUrl({ type: 'glob', value: '*://example.com/**' }),
    'https://example.com/',
  );
  assert.equal(deriveOpenUrl({ type: 'glob', value: 'https://*.example.com/**' }), null);
  assert.equal(deriveOpenUrl({ type: 'regex', value: '.*' }), null);
});
