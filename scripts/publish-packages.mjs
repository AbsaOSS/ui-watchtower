// Publishes the packages released at the checked-out commit: the core first,
// then the Angular package that depends on it. Run after `npm run build`; it
// publishes the built dist/ directories, never sources or the private root.
//
// A package is published only if its release tag points at this commit and
// its version isn't on npm yet, so a failed run can simply be run again on
// the release tag. Anything npm reports other than "not found" stops the run
// before any later package: a failed core is never followed by its adapter.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** In publishing order: each package after those it depends on. */
export const PACKAGES = [
  {
    name: '@absaoss-cps/ui-watchtower',
    path: 'projects/ui-watchtower',
    component: 'ui-watchtower',
    dist: 'dist/ui-watchtower'
  },
  {
    name: '@absaoss-cps/ngx-ui-watchtower',
    path: 'projects/ngx-ui-watchtower',
    component: 'ngx-ui-watchtower',
    dist: 'dist/ngx-ui-watchtower',
    dependsOn: '@absaoss-cps/ui-watchtower'
  }
];

/**
 * @param {object} options
 * @param {string} options.root the repository root, holding the built dist/
 * @param {(command: string, args: string[], options?: {cwd?: string, inherit?: boolean}) =>
 *   {status: number | null, stdout: string, stderr: string}} options.run runs a command
 * @param {(line: string) => void} options.log prints progress
 */
export function publishPackages({ root, run, log }) {
  const releases = PACKAGES.map((pkg) => {
    const manifest = readBuiltManifest(root, pkg);
    const tag = `${pkg.component}-v${manifest.version}`;
    return { ...pkg, manifest, version: manifest.version, tag };
  });
  const head = git(run, ['rev-parse', 'HEAD']).trim();
  const here = releases.filter((release) => tagPointsAt(run, release, head));
  if (here.length === 0) {
    throw new Error(
      `no release tag points at ${head}: run this on a release tag`
    );
  }
  here.forEach((release) => checkDependencyRange(release, releases));

  const onNpm = new Set();
  for (const release of releases) {
    const label = `${release.name}@${release.version}`;
    if (!here.includes(release)) {
      log(`${label}: skipped, not released at this commit`);
      continue;
    }
    if (isPublished(run, release.name, release.version)) {
      log(`${label}: skipped, already on npm`);
    } else {
      checkDependencyOnNpm(run, release, releases, onNpm);
      const result = run('npm', ['publish'], {
        cwd: join(root, release.dist),
        inherit: true
      });
      if (result.status !== 0) {
        throw new Error(`npm publish ${label} failed (exit ${result.status})`);
      }
      log(`${label}: published`);
    }
    onNpm.add(release.name);
  }
}

/** The built manifest, which must be the package's own: never the root's. */
function readBuiltManifest(root, pkg) {
  const manifest = JSON.parse(
    readFileSync(join(root, pkg.dist, 'package.json'), 'utf8')
  );
  if (manifest.name !== pkg.name || manifest.private) {
    throw new Error(`${pkg.dist} is not the publishable ${pkg.name}`);
  }
  return manifest;
}

function git(run, args) {
  const result = run('git', args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${firstLine(result)}`);
  }
  return result.stdout;
}

/**
 * A lightweight tag is listed as its commit; an annotated one as its tag
 * object, and as `^{}` the commit it points at, listed only when asked for.
 */
function tagPointsAt(run, release, head) {
  const ref = `refs/tags/${release.tag}`;
  const listing = git(run, ['ls-remote', '--tags', 'origin', ref, `${ref}^{}`]);
  return listing.split('\n').some((line) => line.split('\t')[0] === head);
}

/**
 * The adapter depends on `^` the core it was built against: Release Please's
 * node-workspace plugin moves that range with every core release.
 */
function checkDependencyRange(release, releases) {
  if (!release.dependsOn) {
    return;
  }
  const dependency = releases.find((other) => other.name === release.dependsOn);
  const range = release.manifest.dependencies?.[dependency.name];
  if (range !== `^${dependency.version}`) {
    throw new Error(
      `${release.name}@${release.version} depends on ${dependency.name}@${range}, ` +
        `not on ^${dependency.version}, the version it was built against`
    );
  }
}

function checkDependencyOnNpm(run, release, releases, onNpm) {
  const dependency = releases.find((other) => other.name === release.dependsOn);
  if (
    dependency &&
    !onNpm.has(dependency.name) &&
    !isPublished(run, dependency.name, dependency.version)
  ) {
    throw new Error(
      `${release.name}@${release.version} needs ` +
        `${dependency.name}@${dependency.version}, which is not on npm`
    );
  }
}

/** On npm, or not found there; any other answer is an error, never a guess. */
function isPublished(run, name, version) {
  const spec = `${name}@${version}`;
  const result = run('npm', [
    'view',
    spec,
    'version',
    '--json',
    '--prefer-online'
  ]);
  const output = parseJson(result.stdout);
  if (result.status === 0 && output === version) {
    return true;
  }
  if (result.status !== 0 && output?.error?.code === 'E404') {
    return false;
  }
  const reason = output?.error
    ? `${output.error.code}: ${output.error.summary}`
    : firstLine(result);
  throw new Error(`npm view ${spec} failed: ${reason}`);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function firstLine({ status, stdout, stderr }) {
  return (stderr || stdout).trim().split('\n')[0] || `exit ${status}`;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, { cwd = ROOT, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe'
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? String(result.error ?? '')
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    publishPackages({ root: ROOT, run, log: (line) => console.log(line) });
  } catch (error) {
    console.error(`publish: ${error.message}`);
    process.exitCode = 1;
  }
}
