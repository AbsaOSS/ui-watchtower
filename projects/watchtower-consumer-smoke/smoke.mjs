// `npm run smoke`: the library as a consumer gets it. Packs the built
// package, then sets this app up on its own, in a folder outside the
// workspace: its own package.json and angular.json, and an `npm install`
// with npm's peer checks, so nothing comes from the workspace. Builds it for
// the browser and the server, and checks the result. Prints a line per
// check; exits non-zero if any fails, keeping the folder to look into.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = join(ROOT, 'projects/watchtower-consumer-smoke');
const PACKAGE = join(ROOT, 'dist/ngx-ui-watchtower');
const shell = process.platform === 'win32';

/** What the app depends on, at the versions the workspace has. */
const DEPENDENCIES = [
  '@angular/animations',
  '@angular/common',
  '@angular/compiler',
  '@angular/core',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/platform-server',
  '@angular/router',
  '@angular/ssr',
  'aws-rum-web',
  'cps-ui-kit',
  'rxjs',
  'tslib'
];
const DEV_DEPENDENCIES = [
  '@angular/build',
  '@angular/cli',
  '@angular/compiler-cli',
  'typescript'
];

let failures = 0;
let consumer;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) {
      console.log(`      ${JSON.stringify(detail)}`);
    }
  }
}

/** Runs a command with its output shown; whether it succeeded. */
function run(command, args, cwd = ROOT) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  return (
    spawnSync(command, args, {
      cwd,
      stdio: 'inherit',
      shell,
      env: { ...process.env, NG_CLI_ANALYTICS: 'false' }
    }).status === 0
  );
}

/** Whether any script in a build's browser output contains `text`. */
function bundleContains(outputPath, text) {
  const browser = join(outputPath, 'browser');
  return readdirSync(browser)
    .filter((file) => file.endsWith('.js'))
    .some((file) => readFileSync(join(browser, file), 'utf8').includes(text));
}

/** A package's version as the workspace has it installed. */
function version(name) {
  return JSON.parse(
    readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')
  ).version;
}

function finish() {
  if (consumer && failures) {
    console.log(`\nThe app is left in ${consumer}`);
  } else if (consumer) {
    rmSync(consumer, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

// 1. The package, as `npm publish` would send it.
if (!run('npm', ['run', 'build'])) {
  check('the library builds', false);
  finish();
}
const packDir = mkdtempSync(join(tmpdir(), 'uwt-smoke-'));
const [packed] = JSON.parse(
  execFileSync(
    'npm',
    ['pack', PACKAGE, '--pack-destination', packDir, '--json'],
    { cwd: ROOT, shell }
  )
);
const files = packed.files.map((f) => f.path);
const expected = [
  'package.json',
  'README.md',
  'LICENSE',
  ...['', '-rum', '-event-inspector'].flatMap((entry) => [
    `fesm2022/absaoss-cps-ngx-ui-watchtower${entry}.mjs`,
    `types/absaoss-cps-ngx-ui-watchtower${entry}.d.ts`
  ])
];
check(
  `the tarball has the manifest, README, LICENSE and all three entry points (${files.length} files)`,
  expected.every((file) => files.includes(file)),
  expected.filter((file) => !files.includes(file))
);
const isSource = (file) =>
  /(^|\/)src\/|\.spec\./.test(file) ||
  (file.endsWith('.ts') && !file.endsWith('.d.ts'));
check(
  'the tarball has no source or spec files',
  !files.some(isSource),
  files.filter(isSource)
);

// 2. The app on its own, outside the workspace: its sources, and a manifest
// and build target of its own — the workspace's target, with its paths made
// the app's.
consumer = mkdtempSync(join(tmpdir(), 'uwt-consumer-'));
cpSync(join(APP, 'src'), join(consumer, 'src'), { recursive: true });
cpSync(join(APP, 'tsconfig.app.json'), join(consumer, 'tsconfig.app.json'));
const pinned = (names) =>
  Object.fromEntries(names.map((name) => [name, version(name)]));
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'watchtower-consumer',
      private: true,
      dependencies: {
        ...pinned(DEPENDENCIES),
        '@absaoss-cps/ngx-ui-watchtower': `file:${join(packDir, packed.filename)}`
      },
      devDependencies: pinned(DEV_DEPENDENCIES)
    },
    null,
    2
  )
);
const target = JSON.parse(readFileSync(join(ROOT, 'angular.json'), 'utf8'))
  .projects['watchtower-consumer-smoke'];
const own = JSON.parse(
  JSON.stringify(target)
    .replaceAll('projects/watchtower-consumer-smoke/', '')
    .replaceAll('dist/watchtower-consumer-smoke', 'dist/app')
);
writeFileSync(
  join(consumer, 'angular.json'),
  JSON.stringify(
    {
      version: 1,
      cli: { analytics: false },
      projects: { app: { ...own, root: '', sourceRoot: 'src' } }
    },
    null,
    2
  )
);

// 3. Installed as a consumer installs it, peer checks and all: a peer the
// package leaves out or mis-ranges fails here, as it would for the app.
const installed = run(
  'npm',
  ['install', '--no-package-lock', '--no-audit', '--no-fund'],
  consumer
);
const library = join(consumer, 'node_modules/@absaoss-cps/ngx-ui-watchtower');
check(
  `the tarball installs, with its peers checked (${packed.id})`,
  installed &&
    existsSync(join(library, 'package.json')) &&
    JSON.parse(readFileSync(join(library, 'package.json'), 'utf8')).version ===
      packed.version
);
rmSync(packDir, { recursive: true, force: true });
check(
  'no second copy of Angular is installed beside it',
  !existsSync(join(library, 'node_modules/@angular'))
);
if (failures) {
  finish();
}

// 4. Built against the published typings and bundles, for the browser and,
// prerendering, the server.
check(
  'the app builds and prerenders without /rum',
  run('npx', ['ng', 'build', 'app'], consumer)
);
check(
  'the app builds and prerenders with /rum',
  run('npx', ['ng', 'build', 'app', '-c', 'rum'], consumer)
);
if (failures) {
  finish();
}

// 5. The builds' output. The RUM SDK sends to `/appmonitors/`, a path in no
// part of this library, which minifying keeps.
const SDK = '/appmonitors/';
check(
  'without /rum, no aws-rum-web in the bundle',
  !bundleContains(join(consumer, 'dist/app'), SDK)
);
check(
  'with /rum, aws-rum-web is in the bundle — the check above can see it',
  bundleContains(join(consumer, 'dist/app-rum'), SDK)
);
const prerendered = readFileSync(
  join(consumer, 'dist/app/browser/index.html'),
  'utf8'
);
check(
  'the page was rendered on the server',
  /<h1[^>]*>ngx-ui-watchtower consumer smoke<\/h1>/.test(prerendered)
);

finish();
