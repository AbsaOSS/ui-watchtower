// Replays releases through Release Please on this repository's release config,
// as the release workflow runs it: what each release PR changes, and which
// releases merging it creates. GitHub is simulated in memory; Release Please
// is installed, at the version the workflow's action bundles, into a
// temporary directory, so this needs a network. `npm run release:check`.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGES } from './publish-packages.mjs';

/** What googleapis/release-please-action@v5 (5.0.0) bundles: keep in step. */
const RELEASE_PLEASE = '17.6.0';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = mkdtempSync(join(tmpdir(), 'uwt-release-check-'));
const [CORE, NGX] = PACKAGES;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const config = JSON.parse(read('release-please-config.json'));
const manifest = JSON.parse(read('.release-please-manifest.json'));

function check(condition, what) {
  if (!condition) {
    throw new Error(`release-check: expected ${what}`);
  }
}

/** A repository holding `files` on main, its releases, commits (newest first) and merged PRs. */
function gitHub({ files, releases = [], commits = [], pulls = [] }, Errors) {
  const contents = (path) => {
    if (!(path in files)) {
      throw new Errors.FileNotFoundError(path);
    }
    return {
      sha: path,
      content: '',
      parsedContent: files[path],
      mode: '100644'
    };
  };
  const yieldAll = (items) =>
    async function* () {
      yield* items;
    };
  return {
    repository: {
      owner: 'AbsaOSS',
      repo: 'ui-watchtower',
      defaultBranch: 'main'
    },
    getFileContentsOnBranch: async (path) => contents(path),
    getFileJson: async (path) => JSON.parse(contents(path).parsedContent),
    releaseIterator: yieldAll(releases),
    tagIterator: yieldAll(
      releases.map((release) => ({ name: release.tagName, sha: release.sha }))
    ),
    mergeCommitIterator: yieldAll(commits),
    pullRequestIterator: yieldAll(pulls),
    findFilesByFilenameAndRef: async () => [],
    findFilesByGlobAndRef: async () => []
  };
}

const release = (tagName, sha) => ({
  name: tagName,
  tagName,
  sha,
  notes: '',
  url: ''
});
const commit = (sha, message, ...files) => ({ sha, message, files });
const file = (pkg, name = 'src/index.ts') => `${pkg.path}/${name}`;
const json = (files, path) => JSON.parse(files[path]);

/** The release files at one linked `version`: what a release leaves behind. */
function filesAt(version) {
  const files = {
    'release-please-config.json': read('release-please-config.json'),
    '.release-please-manifest.json': JSON.stringify(
      Object.fromEntries(PACKAGES.map((pkg) => [pkg.path, version]))
    )
  };
  for (const pkg of PACKAGES) {
    const packageJson = JSON.parse(read(`${pkg.path}/package.json`));
    packageJson.version = version;
    if (pkg.dependsOn) {
      packageJson.dependencies[pkg.dependsOn] = `^${version}`;
    }
    files[`${pkg.path}/package.json`] = JSON.stringify(packageJson, null, 2);
  }
  return files;
}

/** The repository after merging `pullRequest`. */
function merge(files, pullRequest) {
  const merged = { ...files };
  for (const { path, createIfMissing, updater } of pullRequest.updates) {
    if (path in merged || createIfMissing) {
      merged[path] = updater.updateContent(merged[path]);
    }
  }
  return merged;
}

/**
 * Only keys Release Please defines: in its schema, or read by its config
 * parser (the schema leaves a few out, `component` and `package-name` among
 * them). A misspelt key is in neither, and would be silently ignored.
 */
function checkConfigKeys(configSchema, parser) {
  const parsed = [...parser.matchAll(/config\['([\w-]+)'\]/g)].map(
    (match) => match[1]
  );
  const known = (options, defined, where) => {
    const keys = new Set([...Object.keys(defined), ...parsed]);
    const unknown = Object.keys(options).filter((key) => !keys.has(key));
    check(unknown.length === 0, `only known keys ${where}, not ${unknown}`);
  };
  known(config, configSchema.properties, 'in the config');
  for (const [path, options] of Object.entries(config.packages)) {
    known(
      options,
      configSchema.definitions.ReleaserConfigOptions.properties,
      `for ${path}`
    );
  }
  const plugins = configSchema.allOf[1].properties.plugins.items.anyOf;
  for (const plugin of config.plugins) {
    const variant = plugins.find((option) =>
      option.properties?.type?.enum?.includes(plugin.type)
    );
    check(variant, `a plugin Release Please defines, not ${plugin.type}`);
    const unknown = Object.keys(plugin).filter(
      (key) => !(key in variant.properties)
    );
    check(
      unknown.length === 0,
      `only keys the ${plugin.type} plugin defines, not ${unknown}`
    );
  }
}

async function main() {
  writeFileSync(join(WORK, 'package.json'), '{ "private": true }');
  execFileSync(
    'npm',
    [
      'install',
      `release-please@${RELEASE_PLEASE}`,
      '--no-audit',
      '--no-fund',
      '--loglevel=error'
    ],
    { cwd: WORK, stdio: 'inherit' }
  );
  const require = createRequire(join(WORK, 'package.json'));
  const {
    Errors,
    Manifest,
    configSchema,
    setLogger
  } = require('release-please');
  const parser = readFileSync(
    require.resolve('release-please/build/src/manifest.js'),
    'utf8'
  );
  const silent = () => {};
  setLogger({
    error: silent,
    warn: silent,
    info: silent,
    debug: silent,
    trace: silent
  });

  const manifestOf = (state) =>
    Manifest.fromManifest(
      gitHub(state, Errors),
      'main',
      'release-please-config.json',
      '.release-please-manifest.json'
    );
  /** The release PR Release Please would open, if any. */
  const pullRequestFor = async (state) => {
    const pullRequests = await (await manifestOf(state)).buildPullRequests();
    check(
      pullRequests.length <= 1,
      `one release PR at most, got ${pullRequests.length}`
    );
    return pullRequests[0];
  };
  /** After the PR: each package's version, and the Angular package's core range. */
  const outcome = (files, pullRequest) => {
    const merged = merge(files, pullRequest);
    const versions = Object.fromEntries(
      PACKAGES.map((pkg) => [
        pkg.component,
        json(merged, `${pkg.path}/package.json`).version
      ])
    );
    const range = json(merged, `${NGX.path}/package.json`).dependencies[
      CORE.name
    ];
    return { merged, versions, range };
  };
  const linkedAt = (version, ...changes) => ({
    files: filesAt(version),
    releases: PACKAGES.map((pkg) =>
      release(`${pkg.component}-v${version}`, 'r1')
    ),
    commits: [
      ...changes,
      commit('r1', 'chore: release main', file(CORE, 'package.json'))
    ]
  });

  checkConfigKeys(configSchema, parser);
  const current = manifest[CORE.path];
  check(
    PACKAGES.every((pkg) => manifest[pkg.path] === current),
    'both packages at one version in the manifest'
  );
  console.log(
    `✔ config: only keys Release Please defines; both packages at ${current}`
  );

  // The first linked release, replayed from the workspace as it is: the core
  // never released, the Angular package's last release tagged v<version>
  // (before linking) at bootstrap-sha, which keeps what that release already
  // shipped out of the new changelogs. While git has that tag, bootstrap-sha
  // must be its commit; once the packages are linked, the tag is gone.
  const lastTagged = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `v${current}^{commit}`],
    { cwd: ROOT, encoding: 'utf8' }
  ).stdout?.trim();
  if (lastTagged) {
    check(
      config['bootstrap-sha'] === lastTagged,
      `bootstrap-sha to be ${lastTagged}, the commit tagged v${current}`
    );
  }
  const first = {
    files: {
      'release-please-config.json': read('release-please-config.json'),
      '.release-please-manifest.json': read('.release-please-manifest.json'),
      [`${CORE.path}/package.json`]: read(`${CORE.path}/package.json`),
      [`${NGX.path}/package.json`]: read(`${NGX.path}/package.json`),
      [`${NGX.path}/CHANGELOG.md`]: read(`${NGX.path}/CHANGELOG.md`)
    },
    releases: [release(`v${current}`, config['bootstrap-sha'])],
    commits: [
      commit(
        'c3',
        'feat: add the framework-independent engine',
        file(CORE),
        file(NGX)
      ),
      commit('c2', 'fix: flush logs on page hide', file(NGX)),
      commit('c1', 'feat: document the workspace', 'README.md'),
      commit(
        config['bootstrap-sha'],
        `chore(main): release ${current}`,
        file(NGX, 'package.json')
      ),
      commit('c0', 'feat: a feature already released', file(NGX))
    ]
  };
  const [major, minor] = current.split('.');
  const next = `${major}.${Number(minor) + 1}.0`;
  const firstPullRequest = await pullRequestFor(first);
  check(firstPullRequest, 'a release PR for the first linked release');
  const firstRelease = outcome(first.files, firstPullRequest);
  // Each package's new changelog entry: from its heading to the one before.
  const changelogs = PACKAGES.map((pkg) => {
    const changelog = firstRelease.merged[`${pkg.path}/CHANGELOG.md`] ?? '';
    const start = changelog.indexOf(`## [${next}]`);
    const end = changelog.indexOf('\n## ', start + 1);
    return start < 0 ? '' : changelog.slice(start, end < 0 ? undefined : end);
  });
  check(
    firstRelease.versions[CORE.component] === next &&
      firstRelease.versions[NGX.component] === next,
    `both packages released at ${next}, got ${JSON.stringify(firstRelease.versions)}`
  );
  check(
    firstRelease.range === `^${next}`,
    `the Angular package on ^${next}, got ${firstRelease.range}`
  );
  check(
    PACKAGES.every(
      (pkg) =>
        json(firstRelease.merged, '.release-please-manifest.json')[pkg.path] ===
        next
    ),
    `the manifest at ${next}`
  );
  check(changelogs.every(Boolean), `a ${next} entry in both changelogs`);
  check(
    changelogs[0].includes('add the framework-independent engine') &&
      !changelogs[0].includes('flush logs on page hide'),
    "only the core's own changes in its changelog"
  );
  check(
    changelogs[1].includes('flush logs on page hide') &&
      !changelogs.some((changelog) => changelog.includes('already released')),
    'nothing from the release before in the new entries'
  );
  console.log(
    `✔ first linked release: both packages ${current} → ${next}, the Angular package on ^${next}, two changelogs` +
      (lastTagged ? `, from v${current}'s commit` : '')
  );

  for (const [what, change, expected] of [
    [
      'an Angular-only fix',
      commit('d1', 'fix: an Angular-only fix', file(NGX)),
      '0.5.1'
    ],
    [
      'a core-only feature',
      commit('d1', 'feat: a core-only feature', file(CORE)),
      '0.6.0'
    ],
    [
      'a breaking change before 1.0',
      commit('d1', 'feat!: drop an option', file(CORE)),
      '0.6.0'
    ]
  ]) {
    const state = linkedAt('0.5.0', change);
    const pullRequest = await pullRequestFor(state);
    check(pullRequest, `a release PR for ${what}`);
    const { versions, range } = outcome(state.files, pullRequest);
    check(
      versions[CORE.component] === expected &&
        versions[NGX.component] === expected,
      `${what} to release both packages at ${expected}, got ${JSON.stringify(versions)}`
    );
    check(
      range === `^${expected}`,
      `the Angular package on ^${expected} after ${what}, got ${range}`
    );
    console.log(`✔ ${what} releases both packages: 0.5.0 → ${expected}`);
  }

  const quiet = linkedAt(
    '0.5.0',
    commit('e4', 'docs: explain a setting', file(CORE, 'README.md')),
    commit('e3', 'refactor: tidy the engine', file(CORE)),
    commit('e2', 'test: cover a case', file(NGX, 'src/a.spec.ts')),
    commit('e1', 'feat: a workspace script', 'scripts/tool.mjs')
  );
  check(
    !(await pullRequestFor(quiet)),
    'no release PR without a user-facing change to a package'
  );
  console.log(
    '✔ no release from docs, refactors or tests, nor from changes outside the packages'
  );

  const merged = merge(first.files, firstPullRequest);
  const releases = await (
    await manifestOf({
      files: merged,
      releases: first.releases,
      commits: [
        commit('m1', firstPullRequest.title.toString()),
        ...first.commits
      ],
      pulls: [
        {
          headBranchName: firstPullRequest.headRefName,
          baseBranchName: 'main',
          number: 1,
          title: firstPullRequest.title.toString(),
          body: firstPullRequest.body.toString(),
          labels: firstPullRequest.labels,
          files: [],
          sha: 'm1'
        }
      ]
    })
  ).buildReleases();
  const created = releases
    .map((created) => `${created.path} ${created.tag} ${created.sha}`)
    .sort();
  const expected = PACKAGES.map(
    (pkg) => `${pkg.path} ${pkg.component}-v${next} m1`
  ).sort();
  check(
    JSON.stringify(created) === JSON.stringify(expected),
    `merging it to create ${expected.join(', ')}; got ${created.join(', ')}`
  );
  console.log(
    `✔ merging the release PR creates ${PACKAGES.map((pkg) => `${pkg.component}-v${next}`).join(' and ')} at the merge commit: the tags publishing looks for`
  );
}

try {
  await main();
  console.log('release-check: ok');
} catch (error) {
  console.error(
    error.message.startsWith('release-check:') ? error.message : error
  );
  process.exitCode = 1;
} finally {
  rmSync(WORK, { recursive: true, force: true });
}
