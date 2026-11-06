// `npm run smoke`: the library as a consumer gets it. Packs the built
// package, installs the tarball into this app — which has no paths into the
// source — builds the app for the browser and the server, and checks the
// result. Prints a line per check; exits non-zero if any fails.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = join(ROOT, 'projects/watchtower-consumer-smoke');
const PACKAGE = join(ROOT, 'dist/ngx-ui-watchtower');
const INSTALLED = join(APP, 'node_modules/@absaoss-cps/ngx-ui-watchtower');
const shell = process.platform === 'win32';

let failures = 0;
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
    spawnSync(command, args, { cwd, stdio: 'inherit', shell }).status === 0
  );
}

/** Whether any script in a build's browser output contains `text`. */
function bundleContains(outputPath, text) {
  const browser = join(ROOT, outputPath, 'browser');
  return readdirSync(browser)
    .filter((file) => file.endsWith('.js'))
    .some((file) => readFileSync(join(browser, file), 'utf8').includes(text));
}

function finish() {
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

// 2. Installed as a consumer installs it. Its peers — Angular, rxjs,
// cps-ui-kit, aws-rum-web — come from the workspace, as one copy.
rmSync(join(APP, 'node_modules'), { recursive: true, force: true });
const installed = run(
  'npm',
  [
    'install',
    join(packDir, packed.filename),
    '--no-save',
    '--no-package-lock',
    '--legacy-peer-deps',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund'
  ],
  APP
);
rmSync(packDir, { recursive: true, force: true });
check(
  `the tarball installs (${packed.id})`,
  installed &&
    JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8'))
      .version === packed.version
);
check(
  'no second copy of Angular is installed beside it',
  !existsSync(join(APP, 'node_modules/@angular'))
);
if (failures) {
  finish();
}

// 3. Built against the published typings and bundles, for the browser and,
// prerendering, the server.
check(
  'the app builds and prerenders without /rum',
  run('npx', ['ng', 'build', 'watchtower-consumer-smoke'])
);
check(
  'the app builds and prerenders with /rum',
  run('npx', ['ng', 'build', 'watchtower-consumer-smoke', '-c', 'rum'])
);
if (failures) {
  finish();
}

// 4. The builds' output. The RUM SDK sends to `/appmonitors/`, a path in no
// part of this library, which minifying keeps.
const SDK = '/appmonitors/';
check(
  'without /rum, no aws-rum-web in the bundle',
  !bundleContains('dist/watchtower-consumer-smoke', SDK)
);
check(
  'with /rum, aws-rum-web is in the bundle — the check above can see it',
  bundleContains('dist/watchtower-consumer-smoke-rum', SDK)
);
const prerendered = readFileSync(
  join(ROOT, 'dist/watchtower-consumer-smoke/browser/index.html'),
  'utf8'
);
check(
  'the page was rendered on the server',
  /<h1[^>]*>ngx-ui-watchtower consumer smoke<\/h1>/.test(prerendered)
);

finish();
