#!/usr/bin/env node
/**
 * Pre-build cleanup script.
 * Runs automatically before `yarn android` to prevent Windows file-lock errors
 * caused by stale Ninja/Gradle daemon processes holding .cxx build artifacts.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

function log(msg) {
  console.log(`[prebuild] ${msg}`);
}

// ── 1. Kill processes that hold .cxx file handles ──────────────────────────
const processesToKill = ['ninja', 'cmake'];
if (isWin) {
  processesToKill.forEach(name => {
    try {
      execSync(`taskkill /F /IM ${name}.exe /T 2>nul`, { stdio: 'ignore' });
      log(`Killed ${name}.exe`);
    } catch {
      // Process wasn't running — ignore
    }
  });

  // Stop the Gradle daemon
  try {
    const gradlew = path.join(ROOT, 'android', 'gradlew.bat');
    spawnSync(gradlew, ['--stop'], { cwd: path.join(ROOT, 'android'), stdio: 'ignore' });
    log('Stopped Gradle daemon');
  } catch {
    // No daemon running
  }
} else {
  processesToKill.forEach(name => {
    try {
      execSync(`pkill -f ${name} 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}
  });
}

// ── 2. Remove all stale .cxx CMake cache directories ──────────────────────
function removeDirsNamed(startDir, targetName) {
  if (!fs.existsSync(startDir)) return;
  let entries;
  try { entries = fs.readdirSync(startDir); } catch { return; }

  for (const entry of entries) {
    if (entry === 'node_modules' && startDir === ROOT) continue; // handled separately
    const full = path.join(startDir, entry);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      if (entry === targetName) {
        try { fs.rmSync(full, { recursive: true, force: true }); log(`Removed ${full}`); }
        catch (e) { log(`Could not remove ${full}: ${e.message}`); }
      } else {
        removeDirsNamed(full, targetName);
      }
    }
  }
}

// Clear .cxx in android/ and node_modules
removeDirsNamed(path.join(ROOT, 'android'), '.cxx');
const nmDir = path.join(ROOT, 'node_modules');
if (fs.existsSync(nmDir)) {
  for (const pkg of fs.readdirSync(nmDir)) {
    const androidDir = path.join(nmDir, pkg, 'android');
    if (fs.existsSync(androidDir)) {
      removeDirsNamed(androidDir, '.cxx');
    }
  }
}

log('Pre-build cleanup complete.');
