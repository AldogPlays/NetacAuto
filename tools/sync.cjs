'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
fs.copyFileSync(path.join(root,'script'),path.join(root,'netacad-local.user.js'));
console.log('Synced installable userscript from script.');
