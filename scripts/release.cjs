const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function releaseInfo(pkg, lock, changelog, publishing = false) {
  const version = pkg.version;
  if (!stableVersion.test(version)) throw new Error('Use a version such as 0.2.0 in package.json.');
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error('package.json and package-lock.json versions must match.');
  }
  if (!/^## \[Unreleased\]\s*$/m.test(changelog)) throw new Error('Keep an Unreleased section in CHANGELOG.md.');
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  if (publishing) {
    const pending = sections.findIndex(section => section[1] === 'Unreleased');
    const start = sections[pending].index + sections[pending][0].length;
    const end = sections[pending + 1]?.index ?? changelog.length;
    if (changelog.slice(start, end).trim()) throw new Error('Move all Unreleased entries into the dated release section.');
  }
  const index = sections.findIndex(section => section[1] === version);
  let notes = '';
  if (index >= 0) {
    const section = sections[index];
    const end = sections[index + 1]?.index ?? changelog.length;
    notes = changelog.slice(section.index + section[0].length, end).trim();
    if (publishing && !section[2]) throw new Error('Date the release section in CHANGELOG.md before publishing.');
  }
  if (publishing && (index < 0 || !notes)) {
    throw new Error(`Add dated release notes for ${version} to CHANGELOG.md before releasing main.`);
  }
  return { version, tag: `v${version}`, notes };
}

function checkChangedFiles(files) {
  if (files.length && !files.includes('CHANGELOG.md')) {
    throw new Error('Add a short CHANGELOG.md entry for this change, including documentation and maintenance.');
  }
}

async function publish(info, env, api) {
  if (env.GITHUB_REF !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) {
    throw new Error('Releases must run against an exact commit on main.');
  }
  const refPath = `/git/ref/tags/${info.tag}`;
  const existing = await api('GET', refPath, undefined, true);
  if (existing && (existing.object.type !== 'commit' || existing.object.sha !== env.GITHUB_SHA)) {
    throw new Error(`${info.tag} already points to another commit. Bump the version; never move a released tag.`);
  }
  const released = await api('GET', `/releases/tags/${info.tag}`, undefined, true);
  if (released) {
    if (!existing || released.draft) throw new Error('Existing release needs manual inspection.');
    return released.html_url;
  }
  if (!existing) await api('POST', '/git/refs', { ref: `refs/tags/${info.tag}`, sha: env.GITHUB_SHA });
  const result = await api('POST', '/releases', {
    tag_name: info.tag,
    target_commitish: env.GITHUB_SHA,
    name: info.tag,
    body: info.notes,
    draft: false,
    prerelease: false,
  });
  return result.html_url;
}

async function main() {
  const publishing = process.argv.includes('--publish');
  const info = releaseInfo(
    JSON.parse(fs.readFileSync('package.json', 'utf8')),
    JSON.parse(fs.readFileSync('package-lock.json', 'utf8')),
    fs.readFileSync('CHANGELOG.md', 'utf8'), publishing,
  );
  if (process.env.CHANGE_BASE) {
    const base = process.env.CHANGE_BASE;
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid comparison commit.');
    const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const resolvedBase = /^0+$/.test(base) ? git(['merge-base', 'origin/main', 'HEAD']) : base;
    checkChangedFiles(git(['diff', '--name-only', resolvedBase, 'HEAD']).split('\n').filter(Boolean));
  }
  if (!publishing) return console.log(`Version ${info.version}; package files and changelog checked.`);
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GitHub release credentials or repository missing.');
  const api = async (method, path, body, optional = false) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path} returned ${response.status}. Check existing state before retrying.`);
    return response.json();
  };
  console.log(await publish(info, process.env, api));
}

module.exports = { releaseInfo, checkChangedFiles, publish };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
