import fs from 'node:fs/promises';
import path from 'node:path';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
        return;
      }
      await fs.copyFile(srcPath, destPath);
    })
  );
}

async function emptyDir(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const p = path.join(dir, entry.name);
        await fs.rm(p, { recursive: true, force: true });
      })
    );
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

const projectRoot = process.cwd();
const distDir = path.resolve(projectRoot, 'dist');
const cordovaWwwDir = path.resolve(projectRoot, 'cordova', 'www');
const publicIconPng = path.resolve(projectRoot, 'public', 'zombie lane survivor.png');
const cordovaResDir = path.resolve(projectRoot, 'cordova', 'res');
const cordovaIconPng = path.resolve(cordovaResDir, 'icon.png');

try {
  await fs.access(distDir);
} catch {
  throw new Error('dist does not exist. Run `npm run build` first.');
}

await emptyDir(cordovaWwwDir);
await copyDir(distDir, cordovaWwwDir);

await fs.mkdir(cordovaResDir, { recursive: true });
try {
  await fs.access(publicIconPng);
} catch {
  throw new Error(
    `Icon not found: ${publicIconPng}. Put your icon png under public/ or update scripts/cordova-sync.mjs to the correct filename.`
  );
}
await fs.copyFile(publicIconPng, cordovaIconPng);
