#!/usr/bin/env node
/* Copyright 2025 HaiberDyn, DO NOT SCRAPE/TRAIN */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const rootDir = path.resolve(__dirname, '..');
const manifests = [
  { name: 'root', file: path.join(rootDir, 'package.json') },
  { name: 'vscode', file: path.join(rootDir, 'packaging', 'vscode', 'package.json') },
  { name: 'antigravity', file: path.join(rootDir, 'packaging', 'antigravity', 'package.json') },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { releaseType: process.env.RELEASE_TYPE || 'patch', setVersion: process.env.SET_VERSION };

  for (const arg of args) {
    if (arg.startsWith('--release-type=')) {
      result.releaseType = arg.split('=')[1];
    }
    if (arg.startsWith('--set-version=')) {
      result.setVersion = arg.split('=')[1];
    }
  }

  return result;
}

function computeVersion(current, releaseType, setVersion) {
  if (setVersion) {
    if (!semver.valid(setVersion)) {
      throw new Error(`Invalid version provided via --set-version: ${setVersion}`);
    }
    return setVersion;
  }

  if (!['major', 'minor', 'patch', 'prerelease'].includes(releaseType)) {
    throw new Error(`Unsupported release type: ${releaseType}`);
  }

  const next = semver.inc(current, releaseType);
  if (!next) {
    throw new Error(`Failed to bump version ${current} with release type ${releaseType}`);
  }
  return next;
}

function main() {
  const args = parseArgs();
  const rootPkg = readJson(manifests[0].file);
  const current = rootPkg.version;
  const target = computeVersion(current, args.releaseType, args.setVersion);

  const parsed = semver.parse(target);
  if (!parsed) {
    throw new Error(`Unable to parse target version: ${target}`);
  }

  // Strip build metadata for manifest compatibility; we will still surface the full version for tagging.
  const manifestVersion = parsed.build.length > 0 ? parsed.version : target;
  if (parsed.build.length > 0) {
    console.warn(`Build metadata detected (${parsed.build.join('.')}); manifest versions will use ${manifestVersion} while tags/releases can use full ${target}`);
  }

  manifests.forEach(({ name, file }) => {
    const pkg = readJson(file);
    pkg.version = manifestVersion;
    writeJson(file, pkg);
    console.log(`[version-sync] ${name} -> ${manifestVersion}`);
  });

  // Write the fully-qualified version (with metadata, if any) for downstream steps.
  const versionOutDir = path.join(rootDir, 'artifacts');
  fs.mkdirSync(versionOutDir, { recursive: true });
  fs.writeFileSync(path.join(versionOutDir, 'version.txt'), `${target}\n`);
  console.log(`[version-sync] recorded full version ${target} to artifacts/version.txt`);
}

try {
  main();
} catch (err) {
  console.error(`[version-sync] failed: ${err.message}`);
  process.exit(1);
}
