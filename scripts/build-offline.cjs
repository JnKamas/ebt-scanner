const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const staticRoot = path.resolve('.next/static');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const assets = files(staticRoot).filter(file => /\.(js|css|woff2?)$/.test(file));
const publicAssets = ['/manifest.webmanifest', '/icon.svg'];
const urls = ['/', ...publicAssets, ...assets.map(file => '/_next/static/' + path.relative(staticRoot, file).replaceAll('\\', '/'))];
const template = fs.readFileSync('scripts/service-worker.js', 'utf8');
const hash = createHash('sha256').update(template).update(fs.readFileSync('.next/BUILD_ID'));
for (const file of assets) hash.update(fs.readFileSync(file));
hash.update(fs.readFileSync('app/manifest.webmanifest'));
hash.update(fs.readFileSync('public/icon.svg'));
fs.writeFileSync('public/sw.js', template.replace('__VERSION__', hash.digest('hex').slice(0, 16)).replace('__ASSETS__', JSON.stringify(urls)));
console.log(`Generated offline worker with ${urls.length} app-shell assets.`);
