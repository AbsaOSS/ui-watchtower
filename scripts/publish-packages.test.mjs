// Tests of the publish script, and of how the release workflow and config
// use it. Offline: git and npm are simulated. `npm run test:release`.
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PACKAGES, publishPackages } from './publish-packages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [CORE, NGX] = PACKAGES.map((pkg) => pkg.name);
const HEAD = 'a1b2c3d';
const CORE_TAG = 'ui-watchtower-v0.5.0';
const NGX_TAG = 'ngx-ui-watchtower-v0.5.0';

const roots = [];
after(() =>
  roots.forEach((root) => rmSync(root, { recursive: true, force: true }))
);

/**
 * Both packages built at 0.5.0; `tags` point at HEAD, `elsewhere` at another
 * commit; the registry holds `onNpm`. `failing` makes a command fail:
 * `{ 'view <spec>': '<npm error code>', 'publish <name>': true }`.
 */
function workspace({
  tags = [CORE_TAG, NGX_TAG],
  elsewhere = [],
  onNpm = [],
  failing = {},
  range = '^0.5.0',
  built = {}
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'uwt-publish-'));
  roots.push(root);
  const manifests = {
    [CORE]: { name: CORE, version: '0.5.0' },
    [NGX]: { name: NGX, version: '0.5.0', dependencies: { [CORE]: range } },
    ...built
  };
  for (const pkg of PACKAGES) {
    mkdirSync(join(root, pkg.dist), { recursive: true });
    writeFileSync(
      join(root, pkg.dist, 'package.json'),
      JSON.stringify(manifests[pkg.name])
    );
  }

  const registry = new Set(onNpm);
  const published = [];
  const commands = [];
  const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
  const npmError = (code) => ({
    status: 1,
    stdout: JSON.stringify({
      error: { code, summary: `${code} from the registry` }
    }),
    stderr: ''
  });
  const run = (command, args, { cwd } = {}) => {
    commands.push([command, ...args].join(' '));
    if (command === 'git' && args[0] === 'rev-parse') {
      return ok(`${HEAD}\n`);
    }
    if (command === 'git' && args[0] === 'ls-remote') {
      const tag = args.at(-1).replace('refs/tags/', '');
      const sha = tags.includes(tag)
        ? HEAD
        : elsewhere.includes(tag)
          ? 'f00ba47'
          : '';
      return ok(sha ? `${sha}\trefs/tags/${tag}\n` : '');
    }
    if (command === 'npm' && args[0] === 'view') {
      const spec = args[1];
      if (failing[`view ${spec}`]) {
        return npmError(failing[`view ${spec}`]);
      }
      return registry.has(spec)
        ? ok(JSON.stringify(spec.split('@').pop()))
        : npmError('E404');
    }
    if (command === 'npm' && args[0] === 'publish') {
      const { name, version } = JSON.parse(
        readFileSync(join(cwd, 'package.json'), 'utf8')
      );
      if (failing[`publish ${name}`]) {
        return { status: 1, stdout: '', stderr: '' };
      }
      registry.add(`${name}@${version}`);
      published.push(name);
      return ok('');
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  const lines = [];
  return {
    root,
    run,
    log: (line) => lines.push(line),
    published,
    commands,
    lines
  };
}

describe('publishing a release', () => {
  it('publishes a first release, when the core has never been on npm: the core first', () => {
    const release = workspace();

    publishPackages(release);

    assert.deepEqual(release.published, [CORE, NGX]);
  });

  it('publishes a coordinated release of both packages, the core first', () => {
    const release = workspace({ onNpm: [`${CORE}@0.4.0`, `${NGX}@0.4.0`] });

    publishPackages(release);

    assert.deepEqual(release.published, [CORE, NGX]);
    assert.deepEqual(release.lines, [
      `${CORE}@0.5.0: published`,
      `${NGX}@0.5.0: published`
    ]);
  });

  it('retries a partial release: skips the core already on npm, publishes the Angular package', () => {
    const release = workspace({ onNpm: [`${CORE}@0.5.0`] });

    publishPackages(release);

    assert.deepEqual(release.published, [NGX]);
    assert.deepEqual(release.lines, [
      `${CORE}@0.5.0: skipped, already on npm`,
      `${NGX}@0.5.0: published`
    ]);
  });

  it('can run again after a complete release, publishing nothing', () => {
    const release = workspace({ onNpm: [`${CORE}@0.5.0`, `${NGX}@0.5.0`] });

    publishPackages(release);

    assert.deepEqual(release.published, []);
  });

  it('publishes nothing at a commit no release tag points at', () => {
    const release = workspace({ tags: [], elsewhere: [CORE_TAG, NGX_TAG] });

    assert.throws(
      () => publishPackages(release),
      /no release tag points at a1b2c3d/
    );
    assert.ok(!release.commands.some((command) => command.startsWith('npm')));
  });

  it('never publishes the Angular package once the core fails to publish', () => {
    const release = workspace({ failing: { [`publish ${CORE}`]: true } });

    assert.throws(
      () => publishPackages(release),
      /npm publish @absaoss-cps\/ui-watchtower@0\.5\.0 failed/
    );
    assert.deepEqual(release.published, []);
    assert.ok(!release.commands.some((command) => command.includes(NGX)));
  });

  it('stops on any npm answer other than not found, taking it for neither published nor missing', () => {
    const release = workspace({ failing: { [`view ${CORE}@0.5.0`]: 'E401' } });

    assert.throws(
      () => publishPackages(release),
      /npm view @absaoss-cps\/ui-watchtower@0\.5\.0 failed: E401/
    );
    assert.deepEqual(release.published, []);
  });

  it('publishes only the package released at this commit', () => {
    const release = workspace({
      tags: [NGX_TAG],
      elsewhere: [CORE_TAG],
      onNpm: [`${CORE}@0.5.0`]
    });

    publishPackages(release);

    assert.deepEqual(release.published, [NGX]);
    assert.equal(
      release.lines[0],
      `${CORE}@0.5.0: skipped, not released at this commit`
    );
  });

  it('does not publish the Angular package before the core version it needs is on npm', () => {
    const release = workspace({ tags: [NGX_TAG], elsewhere: [CORE_TAG] });

    assert.throws(
      () => publishPackages(release),
      /needs @absaoss-cps\/ui-watchtower@0\.5\.0, which is not on npm/
    );
    assert.deepEqual(release.published, []);
  });

  it('publishes nothing when the Angular package does not depend on the core released with it', () => {
    const release = workspace({ range: '^0.4.0' });

    assert.throws(
      () => publishPackages(release),
      /depends on @absaoss-cps\/ui-watchtower@\^0\.4\.0/
    );
    assert.deepEqual(release.published, []);
  });

  it('publishes nothing from a directory that is not the built package', () => {
    const release = workspace({
      built: { [NGX]: { name: NGX, version: '0.5.0', private: true } }
    });

    assert.throws(
      () => publishPackages(release),
      /dist\/ngx-ui-watchtower is not the publishable/
    );
    assert.deepEqual(release.published, []);
  });
});

describe('the release wiring', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');
  const config = JSON.parse(read('release-please-config.json'));
  const workflow = read('.github/workflows/release-please.yml');
  const releaseJob = workflow.slice(
    workflow.indexOf('\n  release-please:'),
    workflow.indexOf('\n  publish:')
  );
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

  it('publishes the packages Release Please releases, under the same names and tags', () => {
    const manifest = JSON.parse(read('.release-please-manifest.json'));
    const linked = config.plugins.find(
      (plugin) => plugin.type === 'linked-versions'
    );

    for (const pkg of PACKAGES) {
      assert.equal(config.packages[pkg.path].component, pkg.component);
      assert.equal(config.packages[pkg.path]['package-name'], pkg.name);
      assert.equal(JSON.parse(read(`${pkg.path}/package.json`)).name, pkg.name);
      assert.ok(pkg.path in manifest, `${pkg.path} is in the manifest`);
      assert.ok(
        linked.components.includes(pkg.component),
        `${pkg.component} is linked`
      );
      assert.match(pkg.dist, /^dist\//);
    }
    assert.equal(JSON.parse(read('package.json')).private, true);
  });

  it('runs Release Please on pushes, and exposes each package release', () => {
    assert.match(releaseJob, /if: github\.event_name == 'push'/);
    for (const pkg of PACKAGES) {
      assert.ok(
        releaseJob.includes(
          `steps.release.outputs['${pkg.path}--release_created']`
        )
      );
    }
  });

  it('publishes after a release of either package, or when run by hand to retry', () => {
    const condition = publishJob.slice(
      publishJob.indexOf('if:'),
      publishJob.indexOf('runs-on:')
    );
    const terms = condition.replace(/\s+/g, ' ');

    assert.match(workflow, /\n {2}workflow_dispatch:/);
    assert.ok(terms.includes('!cancelled()'));
    assert.ok(terms.includes("github.event_name == 'workflow_dispatch'"));
    assert.ok(
      terms.includes(
        "needs.release-please.outputs.core_release_created == 'true'"
      )
    );
    assert.ok(
      terms.includes(
        "needs.release-please.outputs.ngx_release_created == 'true'"
      )
    );
  });

  it('builds, then publishes through this script, with trusted publishing and no cache', () => {
    const steps = [
      'run: npm ci',
      'run: npm run build',
      'run: node scripts/publish-packages.mjs'
    ];
    const positions = steps.map((step) => publishJob.indexOf(step));

    assert.ok(
      positions.every((position) => position > 0),
      'every step is there'
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions
    );
    assert.match(publishJob, /id-token: write/);
    assert.match(publishJob, /package-manager-cache: false/);
    assert.doesNotMatch(publishJob, /npm publish/);
  });
});
