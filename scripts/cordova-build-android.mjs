import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const cordovaDir = path.resolve(projectRoot, 'cordova');
const configXml = path.resolve(cordovaDir, 'config.xml');
const androidDir = path.resolve(cordovaDir, 'platforms', 'android');
const toolsDir = path.resolve(androidDir, 'tools');
const gradlewBat = path.resolve(toolsDir, 'gradlew.bat');
const gradlewSh = path.resolve(toolsDir, 'gradlew');
const gradleWrapperProperties = path.resolve(
  toolsDir,
  'gradle',
  'wrapper',
  'gradle-wrapper.properties'
);

try {
  await fs.access(configXml);
} catch {
  throw new Error(
    'cordova/config.xml not found. Initialize a Cordova project in the ./cordova folder first.'
  );
}

const configXmlContent = await fs.readFile(configXml, 'utf8');
const widgetIdMatch = configXmlContent.match(/<widget\s+[^>]*id="([^"]+)"/);
const widgetId = widgetIdMatch?.[1];
if (!widgetId) {
  throw new Error('Could not read widget id from cordova/config.xml');
}

const expectedActivityDir = path.resolve(
  androidDir,
  'app',
  'src',
  'main',
  'java',
  ...widgetId.split('.')
);
try {
  await fs.access(expectedActivityDir);
} catch {
  throw new Error(
    `Android platform sources do not match widget id (${widgetId}).\n` +
      `Expected Java package folder: ${expectedActivityDir}\n` +
      `Fix by re-adding the android platform:\n` +
      `  (in ./cordova) cordova platform rm android\n` +
      `  (in ./cordova) cordova platform add android\n`
  );
}

const hasGradleWrapper = await (async () => {
  try {
    await fs.access(gradlewBat);
    return true;
  } catch {}
  try {
    await fs.access(gradlewSh);
    return true;
  } catch {}
  return false;
})();

const gradleDistZip = process.env.CORDOVA_GRADLE_DIST_ZIP;

const localDistUrl = gradleDistZip
  ? pathToFileURL(path.resolve(gradleDistZip)).toString()
  : undefined;

async function ensureGradleWrapperUsesLocalDist() {
  if (!gradleDistZip) {
    throw new Error(
      'Gradle wrapper download is blocked. Set env var CORDOVA_GRADLE_DIST_ZIP to a local gradle-*-bin.zip path, then retry.'
    );
  }

  const distUrl = localDistUrl;
  if (!distUrl) {
    throw new Error('Could not resolve local Gradle distribution url');
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      'gradle',
      [
        '-p',
        toolsDir,
        'wrapper',
        '--gradle-version',
        '8.13',
        '--gradle-distribution-url',
        distUrl,
      ],
      {
        cwd: cordovaDir,
        stdio: 'inherit',
        shell: true,
      }
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gradle wrapper failed with exit code ${code}`));
    });
  });

  try {
    const current = await fs.readFile(gradleWrapperProperties, 'utf8');
    if (current.includes('services.gradle.org') || current.includes('downloads.gradle.org')) {
      const updated = current.replace(
        /distributionUrl\s*=.*$/m,
        `distributionUrl=${distUrl}`
      );
      await fs.writeFile(gradleWrapperProperties, updated, 'utf8');
    }
  } catch {}
}

if (localDistUrl) {
  try {
    const current = await fs.readFile(gradleWrapperProperties, 'utf8');
    const updated = current.replace(/distributionUrl\s*=.*$/m, `distributionUrl=${localDistUrl}`);
    if (updated !== current) {
      await fs.writeFile(gradleWrapperProperties, updated, 'utf8');
    }
  } catch {
    await ensureGradleWrapperUsesLocalDist();
  }
} else if (!hasGradleWrapper) {
  await ensureGradleWrapperUsesLocalDist();
}

async function runCordova(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('cordova', args, {
      cwd: cordovaDir,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`cordova ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

await runCordova(['prepare', 'android']);
await runCordova(['build', 'android']);
