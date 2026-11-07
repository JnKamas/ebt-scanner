const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseInfo, checkChangedFiles, publish } = require('../scripts/release.cjs');
const pkg = { version: '0.2.0' };
const lock = { version: '0.2.0', packages: { '': { version: '0.2.0' } } };
const changelog = '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-07\n\n- Privacy information.\n\n## [0.1.0] - 2026-11-06\n\n- Initial app.\n';
const sha = 'a'.repeat(40);

test('release notes come from the matching version; development may remain unreleased', () => {
  assert.deepEqual(releaseInfo(pkg, lock, changelog, true), { version: '0.2.0', tag: 'v0.2.0', notes: '- Privacy information.' });
  assert.equal(releaseInfo(pkg, lock, '## [Unreleased]\n\n- Work in progress.').version, '0.2.0');
  assert.throws(() => releaseInfo(pkg, lock, '## [Unreleased]\n', true), /dated release notes/);
  assert.throws(() => releaseInfo(pkg, lock, changelog.replace(' - 2026-11-07', ''), true), /Date the release/);
  assert.throws(() => releaseInfo(pkg, lock, changelog.replace('## [Unreleased]', '## [Unreleased]\n\n- Pending change.'), true), /Move all Unreleased/);
});

test('version mismatches, invalid versions and missing changelog updates fail checks', () => {
  assert.throws(() => releaseInfo(pkg, { ...lock, version: '0.1.0' }, changelog), /must match/);
  assert.throws(() => releaseInfo(pkg, { ...lock, packages: { '': { version: '0.1.0' } } }, changelog), /must match/);
  assert.throws(() => releaseInfo({ version: '01.2.0' }, lock, changelog), /Use a version/);
  assert.throws(() => releaseInfo(pkg, lock, ''), /Unreleased/);
  assert.throws(() => checkChangedFiles(['README.md']), /CHANGELOG/);
  checkChangedFiles(['README.md', 'CHANGELOG.md']);
  checkChangedFiles([]);
});

test('publishing tags the tested main commit and retries do not duplicate releases', async () => {
  const info = releaseInfo(pkg, lock, changelog, true);
  const env = { GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha };
  const writes = [];
  let tagged = false, released = false;
  const api = async (method, path, body) => {
    if (method === 'GET' && path.startsWith('/git/ref/')) return tagged ? { object: { type: 'commit', sha } } : null;
    if (method === 'GET') return released ? { html_url: 'https://example.test/release', draft: false } : null;
    writes.push({ path, body });
    if (path === '/git/refs') { tagged = true; return {}; }
    released = true;
    return { html_url: 'https://example.test/release' };
  };
  assert.equal(await publish(info, env, api), 'https://example.test/release');
  assert.equal(writes[0].body.sha, sha);
  assert.equal(writes[1].body.body, '- Privacy information.');
  await publish(info, env, api);
  assert.equal(writes.length, 2);
  await assert.rejects(publish(info, { ...env, GITHUB_REF: 'refs/heads/develop' }, api), /main/);
  await assert.rejects(publish(info, env, async () => ({ object: { type: 'commit', sha: 'b'.repeat(40) } })), /never move/);
});
