'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname,'..');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const destination = path.join(root,'dist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = new Map([
    ['course-helper-local-'+pkg.version+'.user.js','netacad-local.user.js'],
    ...['README.md','USAGE.txt','CHANGELOG.md','PERFORMANCE.txt','CONTRIBUTING.md','RELEASING.md','LICENSE','NOTICE.txt'].map(name => [name,name])
].sort(([a],[b]) => a.localeCompare(b,'en')));
// Read the explicit allowlist before replacing the generated output directory.
const contents = [...assets].map(([name,source]) => [name,fs.readFileSync(path.join(root,source))]);
fs.rmSync(destination,{recursive:true,force:true});
fs.mkdirSync(destination,{recursive:true});
const files = contents.map(([name,bytes]) => {
    fs.writeFileSync(path.join(destination,name),bytes);
    return {name,bytes:bytes.length,sha256:hash(bytes)};
});
const manifest = Buffer.from(JSON.stringify({name:pkg.name,version:pkg.version,files},null,2)+'\n');
fs.writeFileSync(path.join(destination,'release-manifest.json'),manifest);
const checksums = [...files,{name:'release-manifest.json',sha256:hash(manifest)}]
    .sort((a,b) => a.name.localeCompare(b.name,'en'))
    .map(file => file.sha256+'  '+file.name).join('\n')+'\n';
fs.writeFileSync(path.join(destination,'SHA256SUMS'),checksums);
console.log('Prepared '+files.length+' assets plus manifest and checksums in dist/ for v'+pkg.version+'.');
