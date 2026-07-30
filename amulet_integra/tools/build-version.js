#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}

const version = argument('version');
const faceSource = path.resolve(argument('face'));
const archiveSource = path.resolve(argument('archive'));
const indexSource = path.resolve(argument('index'));
const integraRoot = path.resolve(__dirname, '..');
const versionRoot = path.join(integraRoot, 'versions', version);

function normalize(value) { return value.split(path.sep).join('/'); }
function relative(base, file) { return normalize(path.relative(base, file)); }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); }
function ensureDirectory(dir, label) { if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`${label} missing: ${dir}`); }
function ensureFile(file, label) { if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`${label} missing: ${file}`); }
function files(root) {
  const output = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) output.push(file);
    }
  };
  visit(root);
  return output;
}
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function counts(root) {
  const result = { files: 0, html: 0, css: 0, js: 0, media: 0, bytes: 0 };
  for (const file of files(root)) {
    const lower = file.toLowerCase();
    result.files += 1; result.bytes += fs.statSync(file).size;
    if (lower.endsWith('.html') || lower.endsWith('.htm')) result.html += 1;
    else if (lower.endsWith('.css')) result.css += 1;
    else if (lower.endsWith('.js')) result.js += 1;
    else if (['.png','.jpg','.jpeg','.gif','.webp','.svg','.mp4','.webm','.mp3','.wav','.ogg','.mov'].some(ext => lower.endsWith(ext))) result.media += 1;
  }
  return result;
}
function injectBridge(file, current) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-amulet-integra-bridge')) return;
  const link = mode => `<a href="../index.html#${mode}" style="color:${mode === 'face' ? '#00cf35' : mode === 'archive' ? '#00b8ff' : '#ff62ce'};text-decoration:none;padding:5px 8px;border-radius:999px"${mode === current ? ' aria-current="page"' : ''}>${mode}</a>`;
  const bridge = `<div data-amulet-integra-bridge aria-label="Amulet navigation" style="position:fixed;right:12px;bottom:12px;z-index:2147483646;display:flex;gap:6px;padding:6px;border:1px solid rgba(120,170,190,.35);border-radius:999px;background:rgba(5,8,12,.82);backdrop-filter:blur(10px);font:12px/1.2 'Favorit Tumblr 85','Segoe UI',sans-serif">${link('face')}${link('archive')}${link('find')}</div>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bridge}\n</body>`) : html + bridge;
  fs.writeFileSync(file, html, 'utf8');
}

ensureDirectory(faceSource, 'Face source');
ensureDirectory(archiveSource, 'Archive source');
ensureFile(indexSource, 'Archive search index');
if (fs.existsSync(versionRoot)) throw new Error(`Refusing to overwrite existing version: ${versionRoot}`);

const faceDest = path.join(versionRoot, 'face');
const archiveDest = path.join(versionRoot, 'archive');
fs.mkdirSync(path.dirname(versionRoot), { recursive: true });
fs.mkdirSync(versionRoot, { recursive: false });
fs.cpSync(faceSource, faceDest, { recursive: true, force: false, errorOnExist: true });
fs.cpSync(archiveSource, archiveDest, { recursive: true, force: false, errorOnExist: true });
fs.copyFileSync(indexSource, path.join(versionRoot, 'archive-index.json'));

injectBridge(path.join(faceDest, 'index.html'), 'face');
injectBridge(path.join(archiveDest, 'index.html'), 'archive');
write(path.join(versionRoot, 'index.html'), fs.readFileSync(path.join(integraRoot, 'templates', 'version-index.html'), 'utf8').replaceAll('__VERSION__', version));
write(path.join(integraRoot, 'index.html'), fs.readFileSync(path.join(integraRoot, 'templates', 'landing.html'), 'utf8'));

const textExtensions = new Set(['.html','.htm','.css','.js','.json','.txt','.xml','.svg','.md']);
const forbidden = [];
for (const file of files(versionRoot)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/C:\\Users\\stran|file:\/\/\/C:\/Users\/stran/i.test(text)) forbidden.push(relative(versionRoot, file));
}
if (forbidden.length) throw new Error(`Private local paths found in publish tree: ${forbidden.slice(0, 20).join(', ')}`);

const sourceCounts = { face: counts(faceSource), archive: counts(archiveSource) };
const copiedCounts = { face: counts(faceDest), archive: counts(archiveDest) };
if (sourceCounts.face.files !== copiedCounts.face.files || sourceCounts.archive.files !== copiedCounts.archive.files) throw new Error('Recursive copy count mismatch');

const manifestFiles = files(versionRoot).filter(file => path.basename(file) !== 'version.json').map(file => ({ path: relative(versionRoot, file), bytes: fs.statSync(file).size, sha256: hash(file) }));
const record = {
  schema: 1,
  id: version,
  status: 'immutable',
  created_at: new Date().toISOString(),
  summary: 'First non-destructive integration of the Neocities Face and generated Tumblr Archive, with preserved snapshots, shared navigation, and searchable archive metadata.',
  sources: [
    { id: 'face-neocities', label: 'amulet face (neocities)/amuletmaiden', copied_as: 'face/', source_counts: sourceCounts.face, copied_counts: copiedCounts.face },
    { id: 'amuletarchive-generated', label: 'amuletarchive-site', copied_as: 'archive/', source_counts: sourceCounts.archive, copied_counts: copiedCounts.archive },
    { id: 'accepted-reader-index', label: 'archive-index.json from the accepted local reader', copied_as: 'archive-index.json' }
  ],
  integration: {
    entrypoint: 'index.html',
    modes: ['face','archive','find'],
    source_entrypoints_modified_only_in_copy: ['face/index.html','archive/index.html'],
    original_sources_modified: false,
    public_notes: 'Outward presentation remains subtle; explicit internal K–T doctrine is not published.'
  },
  files: manifestFiles
};
write(path.join(versionRoot, 'version.json'), JSON.stringify(record, null, 2) + '\n');

const versionsFile = path.join(integraRoot, 'versions.json');
const catalogue = JSON.parse(fs.readFileSync(versionsFile, 'utf8'));
catalogue.versions = catalogue.versions || [];
if (catalogue.versions.some(item => item.id === version)) throw new Error(`Catalogue already contains ${version}`);
catalogue.versions.push({ id: version, path: `versions/${version}/`, created_at: record.created_at, status: 'immutable', summary: record.summary, manifest: `versions/${version}/version.json`, file_count: manifestFiles.length + 1 });
write(versionsFile, JSON.stringify(catalogue, null, 2) + '\n');
write(path.join(integraRoot, 'current.json'), JSON.stringify({ schema: 1, version, path: `versions/${version}/`, status: 'validated', manifest: `versions/${version}/version.json` }, null, 2) + '\n');

const required = ['index.html','version.json','archive-index.json','face/index.html','archive/index.html'].map(name => path.join(versionRoot, name));
const missing = required.filter(file => !fs.existsSync(file));
if (missing.length) throw new Error(`Required files missing: ${missing.join(', ')}`);

process.stdout.write(JSON.stringify({ version, versionRoot, sourceCounts, copiedCounts, publishedFileCount: manifestFiles.length + 1, originalSourcesModified: false, required: required.map(file => relative(integraRoot, file)) }, null, 2) + '\n');
