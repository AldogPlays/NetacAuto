'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const pkg = JSON.parse(read('package.json'));
assert.ok(Number(process.versions.node.split('.')[0]) >= 24,'Use Node.js 24 or newer.');
assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'Version must be a release version.');
assert.equal(read('script'),read('netacad-local.user.js'),'Run npm run sync: installable copy differs.');
const source = read('script');
assert.equal(source.match(/^\/\/ @version\s+(\S+)$/m)?.[1],pkg.version,'Userscript/package version mismatch.');
const reportedVersions = [...source.matchAll(/\bversion:\s*'([^']+)'/g)].map(match => match[1]);
assert.ok(reportedVersions.length >= 2,'Diagnostic version fields are missing.');
reportedVersions.forEach(version => assert.equal(version,pkg.version,'Diagnostic version mismatch.'));
assert.ok(source.includes('Local · v'+pkg.version+' ·'),'Panel version mismatch.');
assert.ok(read('USAGE.txt').split('\n')[0].endsWith('version '+pkg.version),'Usage version mismatch.');
assert.ok(read('CHANGELOG.md').includes('## ['+pkg.version+']'),'Current changelog entry missing.');
assert.ok(read('README.md').includes('**'+pkg.version+'**'),'README version mismatch.');
assert.ok(read('RELEASING.md').includes('`v'+pkg.version+'`'),'Release instructions version mismatch.');
for (const name of ['NOTICE.txt','CONTRIBUTING.md','PERFORMANCE.txt','.github/workflows/ci.yml']) {
    assert.ok(read(name).trim(),name+' is empty.');
}
assert.ok(read('LICENSE').includes('Version 3, 29 June 2007') && read('LICENSE').length > 30000,'Full GPLv3 text is required.');
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG,'v'+pkg.version,'Release tag/version mismatch.');
for (const dir of ['tools','tests']) {
    for (const name of fs.readdirSync(path.join(root,dir)).filter(name => name.endsWith('.cjs'))) {
        const result = spawnSync(process.execPath,['--check',path.join(root,dir,name)],{encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);
    }
}
const result = spawnSync(process.execPath,['--check',path.join(root,'netacad-local.user.js')],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
console.log('Release checks passed for v'+pkg.version+'.');
