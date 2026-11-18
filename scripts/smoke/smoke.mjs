/**
 * Proves the packed packages work outside this workspace — no path alias, no
 * source — installed from their tarballs, as an application installs them.
 *
 *   npm run build && npm run smoke            (-- --keep keeps the consumers)
 *
 * 1. Packs both packages and checks what each tarball holds.
 * 2. A core-only Node consumer: no Angular, RxJS or aws-rum-web installed.
 * 3. A core-only TypeScript consumer: the core's type tests, and a project
 *    without the DOM typings.
 * 4. An unchanged Angular consumer, built and prerendered as a fragment
 *    without aws-rum-web installed, then as a shell with /rum; and the
 *    Angular package's type tests.
 *
 * The Angular package depends on a core version that may not be published
 * yet, so every consumer resolves it to the packed core through `overrides`.
 * Installs from the registry and npm's cache; writes nothing in the
 * workspace.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), 'uwt-smoke-'));
const KEEP = process.argv.includes('--keep');
const workspace = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** The workspace's own range for a package, so consumers match what it tests. */
function rangeOf(name) {
  const range =
    workspace.dependencies?.[name] ?? workspace.devDependencies?.[name];
  check(range, `the workspace declares ${name}`);
  return range;
}

function check(condition, what) {
  if (!condition) {
    throw new Error(`smoke: expected ${what}`);
  }
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NG_CLI_ANALYTICS: 'false', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024
  });
}

function step(message) {
  console.log(`✔ ${message}`);
}

/** Packs a built package, keeping its manifest and file list. */
function pack(dist) {
  const [packed] = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', WORK], join(ROOT, dist))
  );
  return {
    ...packed,
    tarball: join(WORK, packed.filename),
    manifest: JSON.parse(readFileSync(join(ROOT, dist, 'package.json'), 'utf8'))
  };
}

/** What every published tarball must, and must not, hold. */
function checkTarball(pkg, optionalPeers) {
  const files = new Set(pkg.files.map((file) => file.path));
  for (const required of ['README.md', 'LICENSE', 'package.json']) {
    check(files.has(required), `${pkg.name} to ship ${required}`);
  }
  for (const [subpath, target] of Object.entries(pkg.manifest.exports)) {
    if (subpath === './package.json') {
      continue;
    }
    for (const file of [target.types, target.default]) {
      check(
        files.has(file.replace(/^\.\//, '')),
        `${pkg.name} to ship ${file} for ${subpath}`
      );
    }
  }
  for (const file of files) {
    check(
      !/(^|\/)src\//.test(file) &&
        !/\.spec\.|tsconfig|ng-package\.json/.test(file) &&
        !(file.endsWith('.ts') && !file.endsWith('.d.ts')),
      `${pkg.name} not to ship ${file}`
    );
  }
  const { manifest } = pkg;
  check(!manifest.private, `${pkg.name} not to be private`);
  check(
    manifest.publishConfig?.access === 'public',
    `${pkg.name} to publish publicly`
  );
  check(manifest.license === 'Apache-2.0', `${pkg.name} to carry its license`);
  for (const [name, range] of Object.entries({
    ...manifest.dependencies,
    ...manifest.peerDependencies
  })) {
    check(
      !/^(file|link|workspace|portal):/.test(range),
      `${pkg.name} to depend on ${name} by a published version, not ${range}`
    );
  }
  for (const peer of optionalPeers) {
    check(
      manifest.peerDependenciesMeta?.[peer]?.optional === true,
      `${pkg.name} to declare ${peer} an optional peer`
    );
  }
}

/** A consumer project in its own directory, outside the workspace. */
function consumer(name, manifest, template) {
  const dir = join(WORK, name);
  if (template) {
    cpSync(join(HERE, template), dir, { recursive: true });
  } else {
    mkdirSync(dir);
  }
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `uwt-smoke-${name}`,
        version: '0.0.0',
        private: true,
        ...manifest
      },
      null,
      2
    )
  );
  return dir;
}

function install(dir, ...packages) {
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      '--loglevel=error',
      ...packages
    ],
    dir
  );
}

/** Every installed copy of a package, by its directory. */
function copiesOf(dir, name) {
  const nodes = JSON.parse(run('npm', ['query', `#${name}`], dir));
  return new Set(nodes.map((node) => node.path)).size;
}

/** Compiles a consumer's copy of a package's type tests. */
function typeTests(dir, from, compiler, extra) {
  cpSync(from, join(dir, 'type-tests'), {
    recursive: true,
    filter: (path) => !path.endsWith('.json')
  });
  const base = { extends: '../tsconfig.json', include: [] };
  const configs = {
    'tsconfig.json': { files: ['compat.ts', 'empty-registry.ts'] },
    'tsconfig.augmented.json': { files: ['augmented.ts'] }
  };
  for (const [file, files] of Object.entries(configs)) {
    writeFileSync(
      join(dir, 'type-tests', file),
      JSON.stringify({
        ...base,
        compilerOptions: { noEmit: true, ...extra },
        ...files
      })
    );
    run(
      join(dir, 'node_modules', '.bin', compiler),
      ['-p', `type-tests/${file}`],
      dir
    );
  }
}

/**
 * Builds the Angular consumer as one variant, prerendering its page; returns
 * where the RUM sink and the RUM client (aws-rum-web) ended up.
 */
function buildAngular(dir, variant) {
  cpSync(
    join(dir, 'variants', `${variant}.app.config.ts`),
    join(dir, 'src', 'app', 'app.config.ts')
  );
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  run(
    'node',
    [join(dir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build'],
    dir
  );
  const browser = join(dir, 'dist', 'browser');
  const page = readFileSync(join(browser, 'index.html'), 'utf8');
  check(
    page.includes('scenario success'),
    `the ${variant} page prerendered, its scenario run on the server`
  );
  const code = Object.fromEntries(
    readdirSync(browser)
      .filter((file) => file.endsWith('.js'))
      .map((file) => [file, readFileSync(join(browser, file), 'utf8')])
  );
  const files = Object.keys(code);
  return {
    page,
    main: code['main.js'] ?? '',
    // The sink's default endpoint, and the client's own API path: each in
    // its own package only.
    sink: files.filter((file) => code[file].includes('dataplane.rum')),
    client: files.filter((file) => code[file].includes('appmonitors'))
  };
}

try {
  // 1. The tarballs.
  const core = pack('dist/ui-watchtower');
  const ngx = pack('dist/ngx-ui-watchtower');
  checkTarball(core, ['aws-rum-web', 'rxjs']);
  checkTarball(ngx, ['aws-rum-web']);
  const coreRange = ngx.manifest.dependencies['@absaoss-cps/ui-watchtower'];
  check(
    coreRange?.replace(/^[\^~]/, '') === core.version,
    `the Angular package to depend on the core it was built against (${core.version}), not ${coreRange}`
  );
  check(
    !ngx.manifest.peerDependencies['@absaoss-cps/ui-watchtower'],
    'the core to be a dependency of the Angular package, not a peer'
  );
  step(`packed ${core.filename} and ${ngx.filename}: contents and manifests`);

  const coreSpec = `file:${core.tarball}`;
  const overrides = { '@absaoss-cps/ui-watchtower': coreSpec };

  // 2. A Node application, the core only.
  const node = consumer(
    'core-node',
    {
      type: 'module',
      dependencies: { '@absaoss-cps/ui-watchtower': coreSpec }
    },
    'core-node'
  );
  install(node);
  for (const absent of ['@angular/core', 'rxjs', 'aws-rum-web']) {
    check(
      !existsSync(join(node, 'node_modules', absent)),
      `the core alone not to install ${absent}`
    );
  }
  run('node', ['consumer.mjs'], node);
  step(
    'core-only Node consumer: no Angular, RxJS or aws-rum-web; runs, disposes'
  );

  // 3. A TypeScript application, the core only.
  const ts = consumer(
    'core-ts',
    {
      dependencies: {
        '@absaoss-cps/ui-watchtower': coreSpec,
        rxjs: rangeOf('rxjs')
      },
      devDependencies: { typescript: rangeOf('typescript') }
    },
    'core-ts'
  );
  writeFileSync(
    join(ts, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        lib: ['ES2022', 'DOM'],
        types: [],
        skipLibCheck: false
      }
    })
  );
  writeFileSync(
    join(ts, 'tsconfig.nodom.json'),
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { noEmit: true, lib: ['ES2022'] },
      files: ['nodom.ts']
    })
  );
  install(ts);
  typeTests(ts, join(ROOT, 'projects', 'ui-watchtower', 'type-tests'), 'tsc');
  run(
    join(ts, 'node_modules', '.bin', 'tsc'),
    ['-p', 'tsconfig.nodom.json'],
    ts
  );
  step(
    'core-only TypeScript consumer: type tests, augmentation, no DOM typings'
  );

  // 4. An Angular application, as it was written before the core existed.
  const angular = [
    '@angular/common',
    '@angular/compiler',
    '@angular/core',
    '@angular/platform-browser'
  ];
  const app = consumer(
    'angular',
    {
      dependencies: {
        ...Object.fromEntries(angular.map((name) => [name, rangeOf(name)])),
        '@angular/platform-server': rangeOf('@angular/core'),
        '@angular/router': rangeOf('@angular/core'),
        '@angular/ssr': rangeOf('@angular/build'),
        '@absaoss-cps/ngx-ui-watchtower': `file:${ngx.tarball}`,
        rxjs: rangeOf('rxjs'),
        tslib: rangeOf('tslib')
      },
      devDependencies: {
        '@angular/build': rangeOf('@angular/build'),
        '@angular/cli': rangeOf('@angular/cli'),
        '@angular/compiler-cli': rangeOf('@angular/compiler-cli'),
        typescript: rangeOf('typescript')
      },
      overrides
    },
    'angular'
  );
  install(app);
  check(copiesOf(app, '@angular/core') === 1, 'one copy of Angular');
  check(
    copiesOf(app, '@absaoss-cps/ui-watchtower') === 1,
    'one copy of the core, installed with the Angular package'
  );
  check(
    !existsSync(join(app, 'node_modules', 'aws-rum-web')),
    'aws-rum-web not installed for an application without /rum'
  );
  const fragment = buildAngular(app, 'fragment');
  check(
    !fragment.sink.length && !fragment.client.length,
    'neither the RUM sink nor the RUM client in a build without /rum'
  );
  step(
    'Angular fragment without aws-rum-web: built, prerendered, one Angular, one core'
  );
  typeTests(
    app,
    join(ROOT, 'projects', 'ngx-ui-watchtower', 'type-tests'),
    'ngc'
  );
  step(
    'Angular consumer type tests: every export, augmentation, compiled by ngc'
  );

  install(app, `aws-rum-web@${rangeOf('aws-rum-web')}`);
  const shell = buildAngular(app, 'shell');
  const [client] = shell.client;
  check(
    shell.client.length === 1 && client !== 'main.js',
    `the RUM client in a chunk of its own, not in main.js: ${shell.client}`
  );
  check(
    shell.main.includes(`import("./${client}")`) &&
      !shell.main.includes(`from"./${client}"`) &&
      !shell.page.includes(client),
    'the RUM client loaded on demand only, never up front'
  );
  step(
    'Angular shell with /rum: built, prerendered, aws-rum-web loaded on demand'
  );

  if (KEEP) {
    console.log(`smoke: consumers kept in ${WORK}`);
  } else {
    rmSync(WORK, { recursive: true, force: true });
  }
  console.log('smoke: ok');
} catch (error) {
  console.error(error.stdout ?? '', error.stderr ?? '');
  console.error(error.message);
  console.error(`smoke: consumers kept in ${WORK}`);
  process.exitCode = 1;
}
