#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const integraRoot = path.resolve(__dirname, '..');
const versionsRoot = path.join(integraRoot, 'versions');
const verifyHashes = process.argv.includes('--hashes');
const errors = [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(integraRoot, file)}: ${error.message}`);
    return null;
  }
}

function normalized(value) {
  return String(value).split(path.sep).join('/');
}

function safeFile(root, relativePath) {
  const resolved = path.resolve(root, ...String(relativePath).split('/'));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    errors.push(`Path escapes version root: ${relativePath}`);
    return null;
  }
  return resolved;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const catalogue = readJson(path.join(integraRoot, 'versions.json'));
const current = readJson(path.join(integraRoot, 'current.json'));

if (!catalogue || !Array.isArray(catalogue.versions)) {
  errors.push('versions.json must contain a versions array');
}
if (!current || current.schema !== 1) {
  errors.push('current.json must use schema 1');
}

const catalogueVersions = Array.isArray(catalogue?.versions) ? catalogue.versions : [];
const ids = catalogueVersions.map(item => item.id);
if (new Set(ids).size !== ids.length) errors.push('versions.json contains duplicate version IDs');

const directoryIds = fs.existsSync(versionsRoot)
  ? fs.readdirSync(versionsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  : [];
const catalogueIds = [...ids].sort();
if (JSON.stringify(directoryIds) !== JSON.stringify(catalogueIds)) {
  errors.push(`Version directories and catalogue differ: directories=${directoryIds.join(',')} catalogue=${catalogueIds.join(',')}`);
}

for (const item of catalogueVersions) {
  const expectedPath = `versions/${item.id}/`;
  const expectedManifest = `versions/${item.id}/version.json`;
  if (item.status !== 'immutable') errors.push(`${item.id}: catalogue status must be immutable`);
  if (item.path !== expectedPath) errors.push(`${item.id}: catalogue path must be ${expectedPath}`);
  if (item.manifest !== expectedManifest) errors.push(`${item.id}: manifest path must be ${expectedManifest}`);

  const versionRoot = path.join(versionsRoot, item.id);
  const manifestFile = path.join(versionRoot, 'version.json');
  const manifest = readJson(manifestFile);
  if (!manifest) continue;
  if (manifest.id !== item.id) errors.push(`${item.id}: manifest ID mismatch`);
  if (manifest.status !== 'immutable') errors.push(`${item.id}: manifest status must be immutable`);
  if (manifest.integration?.original_sources_modified !== false) errors.push(`${item.id}: original_sources_modified must be false`);
  if (!Array.isArray(manifest.files)) {
    errors.push(`${item.id}: manifest files must be an array`);
    continue;
  }
  if (item.file_count !== manifest.files.length + 1) {
    errors.push(`${item.id}: catalogue file_count does not match manifest`);
  }

  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string') {
      errors.push(`${item.id}: malformed manifest file entry`);
      continue;
    }
    if (seen.has(entry.path)) errors.push(`${item.id}: duplicate manifest path ${entry.path}`);
    seen.add(entry.path);
    const file = safeFile(versionRoot, entry.path);
    if (!file) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      errors.push(`${item.id}: missing file ${entry.path}`);
      continue;
    }
    const size = fs.statSync(file).size;
    if (size !== entry.bytes) errors.push(`${item.id}: byte count mismatch for ${entry.path}`);
    if (!/^[0-9a-f]{64}$/.test(String(entry.sha256))) errors.push(`${item.id}: invalid SHA-256 for ${entry.path}`);
    if (verifyHashes && sha256(file) !== entry.sha256) errors.push(`${item.id}: SHA-256 mismatch for ${entry.path}`);
  }

  for (const required of ['index.html', 'archive-index.json', 'face/index.html', 'archive/index.html']) {
    if (!seen.has(required)) errors.push(`${item.id}: required path absent from manifest: ${required}`);
  }
  for (const alias of manifest.path_aliases || []) {
    const published = safeFile(path.join(versionRoot, alias.scope), alias.published_path);
    if (!published || !fs.existsSync(published)) errors.push(`${item.id}: aliased path missing: ${normalized(alias.published_path)}`);
  }
}

if (catalogueVersions.length) {
  if (!ids.includes(current?.version)) errors.push('current.json points to an uncatalogued version');
  const expectedCurrentPath = `versions/${current?.version}/`;
  const expectedCurrentManifest = `versions/${current?.version}/version.json`;
  if (current?.path !== expectedCurrentPath) errors.push(`current.json path must be ${expectedCurrentPath}`);
  if (current?.manifest !== expectedCurrentManifest) errors.push(`current.json manifest must be ${expectedCurrentManifest}`);
  if (current?.status !== 'validated') errors.push('current.json status must be validated');
}

if (errors.length) {
  console.error(`Amulet Integra validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({
  valid: true,
  versions: ids,
  current: current?.version || null,
  verified_hashes: verifyHashes
}, null, 2));
