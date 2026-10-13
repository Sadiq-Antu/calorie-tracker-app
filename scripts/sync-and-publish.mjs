#!/usr/bin/env node
/**
 * Unified GitHub + Firebase Live App Synchronization & Rollback Script
 *
 * Commands:
 *   1. `npm run ship -- "feat: description of change"`
 *      - Runs tests & builds production bundle
 *      - Commits and pushes changes to GitHub (`origin/main`)
 *      - Deploys the updated build to the live Firebase Hosting app (`https://nutripulse-tracker-antu.web.app`)
 *
 *   2. `npm run rollback -- <commit-sha>`
 *      - Restores the codebase to the exact state of `<commit-sha>`
 *      - Commits the restoration and pushes it to GitHub (`origin/main`)
 *      - Rebuilds and deploys that exact version to the live Firebase Hosting app
 *
 *   3. `npm run history:commits`
 *      - Lists recent commits with SHA, timestamp, and description so you can pick a version to roll back to
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, options = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...options });
}

function getOutput(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function resolveFirebaseCommand() {
  // Check if firebase-tools is already cached locally in npm-cache/_npx for instant execution
  const npxCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (fs.existsSync(npxCacheDir)) {
    const entries = fs.readdirSync(npxCacheDir);
    for (const dir of entries) {
      const candidate = path.join(
        npxCacheDir,
        dir,
        'node_modules',
        'firebase-tools',
        'lib',
        'bin',
        'firebase.js'
      );
      if (fs.existsSync(candidate)) {
        return `node "${candidate}"`;
      }
    }
  }
  return 'npx --yes firebase-tools';
}

const mode = process.argv[2];
const arg = process.argv.slice(3).join(' ').trim();
const firebaseCmd = resolveFirebaseCommand();

if (mode === 'history') {
  console.log('\n=== Commit History (Use any SHA with `npm run rollback -- <sha>`) ===\n');
  run('git log --pretty=format:"%C(yellow)%h%Creset  %C(cyan)%ad%Creset  %s" --date=short -n 25');
  console.log('\n');
  process.exit(0);
}

if (mode === 'ship') {
  const commitMessage =
    arg || `feat: update app (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;

  console.log('=== Step 1/4: Running automated test suite ===');
  run('npm test');

  console.log('=== Step 2/4: Building production PWA bundle ===');
  run('npm run build');

  console.log('=== Step 3/4: Committing & pushing changes to GitHub (origin/main) ===');
  run('git add -A');
  const status = getOutput('git status --porcelain');
  if (status) {
    // Escape double quotes in commit message
    const safeMsg = commitMessage.replace(/"/g, '\\"');
    run(`git commit -m "${safeMsg}"`);
  } else {
    console.log('Working tree already clean; pushing latest commit to origin/main...');
  }
  run('git push origin main');

  console.log('=== Step 4/4: Publishing live app to Firebase Hosting ===');
  run(`${firebaseCmd} deploy --only hosting,firestore:rules,firestore:indexes --project nutripulse-tracker-antu`);

  const currentSha = getOutput('git rev-parse --short HEAD');
  console.log(`\n✓ Successfully synced commit ${currentSha} to both GitHub and https://nutripulse-tracker-antu.web.app!`);
  process.exit(0);
}

if (mode === 'rollback') {
  if (!arg) {
    console.error('\nError: Please provide a target commit SHA to roll back to.');
    console.error('Example: npm run rollback -- 826f069');
    console.error('Run `npm run history:commits` to view available commits.\n');
    process.exit(1);
  }

  const targetRef = arg.split(/\s+/)[0];

  // Verify the commit exists
  let resolvedSha;
  let targetSubject;
  try {
    resolvedSha = getOutput(`git rev-parse --short ${targetRef}`);
    targetSubject = getOutput(`git log -1 --format="%s" ${targetRef}`);
  } catch {
    console.error(`\nError: Commit "${targetRef}" was not found in git history.`);
    process.exit(1);
  }

  console.log(`\n=== Rolling back to commit ${resolvedSha} ("${targetSubject}") ===`);

  // Restore exact tree contents from target commit
  const currentEntries = fs.readdirSync(process.cwd());
  const protectedEntries = new Set(['.git', 'node_modules', 'dist', '.env.local', '.firebase']);
  for (const entry of currentEntries) {
    if (!protectedEntries.has(entry)) {
      fs.rmSync(path.join(process.cwd(), entry), { recursive: true, force: true });
    }
  }

  run(`git checkout ${resolvedSha} -- .`);
  run('git add -A');

  const diffStatus = getOutput('git status --porcelain');
  if (diffStatus) {
    run(`git commit -m "chore(rollback): restore app to commit ${resolvedSha} (${targetSubject.replace(/"/g, "'")})"`);
  } else {
    console.log(`Repository is already identical to commit ${resolvedSha}.`);
  }

  console.log('=== Building restored version ===');
  run('npm run build');

  console.log('=== Pushing rollback commit to GitHub (origin/main) ===');
  run('git push origin main');

  console.log('=== Deploying restored version to live Firebase Hosting ===');
  run(`${firebaseCmd} deploy --only hosting,firestore:rules,firestore:indexes --project nutripulse-tracker-antu`);

  console.log(`\n✓ Rolled back both GitHub (origin/main) and https://nutripulse-tracker-antu.web.app to commit ${resolvedSha}!`);
  process.exit(0);
}

console.error('Unknown mode. Use: ship, rollback, or history');
process.exit(1);
