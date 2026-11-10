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

/**
 * The release files with each package at its version in `versions` (by
 * component), and a dependent on `^` its dependency's: what a release leaves
 * behind.
 */
function filesAt(versions) {
  const files = {
    'release-please-config.json': read('release-please-config.json'),
    '.release-please-manifest.json': JSON.stringify(
      Object.fromEntries(
        PACKAGES.map((pkg) => [pkg.path, versions[pkg.component]])
      )
    )
  };
  for (const pkg of PACKAGES) {
    const packageJson = JSON.parse(read(`${pkg.path}/package.json`));
    packageJson.version = versions[pkg.component];
    if (pkg.dependsOn) {
      const dependency = PACKAGES.find((other) => other.name === pkg.dependsOn);
      packageJson.dependencies[pkg.dependsOn] =
        `^${versions[dependency.component]}`;
    }
    files[`${pkg.path}/package.json`] = JSON.stringify(packageJson, null, 2);
  }
  return files;
}

/** The minor release after `version`: what a `feat` brings before 1.0. */
function minorAfter(version) {
  const [major, minor] = version.split('.');
  return `${major}.${Number(minor) + 1}.0`;
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
  /** A package's changelog entry for `version`: from its heading to the next. */
  const entry = (merged, pkg, version) => {
    const changelog = merged[`${pkg.path}/CHANGELOG.md`] ?? '';
    const heading = new RegExp(
      `^## \\[?${version.replace(/\./g, '\\.')}\\]?[ (]`,
      'm'
    );
    const start = changelog.search(heading);
    if (start < 0) {
      return '';
    }
    const end = changelog.indexOf('\n## ', start + 1);
    return changelog.slice(start, end < 0 ? undefined : end);
  };
  /** The releases merging `pullRequest` creates, as `path tag sha`. */
  const releasesAfter = async (state, pullRequest) => {
    const title = pullRequest.title.toString();
    const releases = await (
      await manifestOf({
        files: merge(state.files, pullRequest),
        releases: state.releases,
        commits: [commit('m1', title), ...state.commits],
        pulls: [
          {
            headBranchName: pullRequest.headRefName,
            baseBranchName: 'main',
            number: 1,
            title,
            body: pullRequest.body.toString(),
            labels: pullRequest.labels,
            files: [],
            sha: 'm1'
          }
        ]
      })
    ).buildReleases();
    return releases
      .map((created) => `${created.path} ${created.tag} ${created.sha}`)
      .sort();
  };
  /** The releases expected for `[package, version]` pairs. */
  const tagsOf = (...released) =>
    released
      .map(([pkg, version]) => `${pkg.path} ${pkg.component}-v${version} m1`)
      .sort();
  /** Each package released at its version in `versions`, then `changes`. */
  const releasedAt = (versions, ...changes) => ({
    files: filesAt(versions),
    releases: PACKAGES.map((pkg) =>
      release(`${pkg.component}-v${versions[pkg.component]}`, 'r1')
    ),
    commits: [
      ...changes,
      commit(
        'r1',
        'chore: release main',
        ...PACKAGES.map((pkg) => file(pkg, 'package.json'))
      )
    ]
  });

  checkConfigKeys(configSchema, parser);
  check(
    PACKAGES.every(
      (pkg) =>
        pkg.path in manifest || config.packages[pkg.path]?.['initial-version']
    ),
    'every package in the manifest, or given an initial-version'
  );
  check(
    !config.plugins.some((plugin) => plugin.type === 'linked-versions'),
    'independent versions: no linked-versions group'
  );
  console.log(
    '✔ config: only keys Release Please defines; each package versioned on its own'
  );

  // The first release, replayed from the workspace as it is. The core: its
  // initial-version until it has a release of its own. The Angular package:
  // its last release tagged v<version> (before its tags named the component)
  // at bootstrap-sha, which keeps what that release shipped out of the new
  // changelog. While git has that tag, bootstrap-sha must be its commit.
  const current = manifest[NGX.path];
  const coreFirst = manifest[CORE.path]
    ? minorAfter(manifest[CORE.path])
    : config.packages[CORE.path]['initial-version'];
  const ngxNext = minorAfter(current);
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
  const firstPullRequest = await pullRequestFor(first);
  check(firstPullRequest, 'a release PR for the first release');
  const firstRelease = outcome(first.files, firstPullRequest);
  const coreEntry = entry(firstRelease.merged, CORE, coreFirst);
  const ngxEntry = entry(firstRelease.merged, NGX, ngxNext);
  check(
    firstRelease.versions[CORE.component] === coreFirst &&
      firstRelease.versions[NGX.component] === ngxNext,
    `the core at ${coreFirst} and the Angular package at ${ngxNext}, got ${JSON.stringify(firstRelease.versions)}`
  );
  check(
    firstRelease.range === `^${coreFirst}`,
    `the Angular package on ^${coreFirst}, got ${firstRelease.range}`
  );
  const firstManifest = json(
    firstRelease.merged,
    '.release-please-manifest.json'
  );
  check(
    firstManifest[CORE.path] === coreFirst &&
      firstManifest[NGX.path] === ngxNext,
    `the manifest at ${coreFirst} and ${ngxNext}, got ${JSON.stringify(firstManifest)}`
  );
  check(
    coreEntry && ngxEntry,
    `a ${coreFirst} entry in the core's changelog and a ${ngxNext} one in the Angular package's`
  );
  check(
    coreEntry.includes('add the framework-independent engine') &&
      !coreEntry.includes('flush logs on page hide'),
    "only the core's own changes in its changelog"
  );
  check(
    ngxEntry.includes('flush logs on page hide') &&
      ![coreEntry, ngxEntry].some((text) => text.includes('already released')),
    'nothing from the release before in the new entries'
  );
  const firstTags = await releasesAfter(first, firstPullRequest);
  const firstExpected = tagsOf([CORE, coreFirst], [NGX, ngxNext]);
  check(
    JSON.stringify(firstTags) === JSON.stringify(firstExpected),
    `merging it to create ${firstExpected.join(', ')}; got ${firstTags.join(', ')}`
  );
  console.log(
    `✔ first release: the core at ${coreFirst}, the Angular package ${current} → ${ngxNext} on ^${coreFirst}, two changelogs` +
      (lastTagged ? `, from v${current}'s commit` : '') +
      `; merging creates ${CORE.component}-v${coreFirst} and ${NGX.component}-v${ngxNext}`
  );

  // Later releases, from packages at versions of their own.
  const start = { [CORE.component]: '0.6.0', [NGX.component]: '0.5.1' };
  for (const [what, changes, expected] of [
    [
      'an Angular-only fix releases only the Angular package',
      [commit('d1', 'fix: an Angular-only fix', file(NGX))],
      { core: '0.6.0', ngx: '0.5.2', released: [NGX] }
    ],
    [
      'a core feature releases the core, and the Angular package to move its dependency',
      [commit('d1', 'feat: a core feature', file(CORE))],
      { core: '0.7.0', ngx: '0.5.2', released: [CORE, NGX] }
    ],
    [
      'a breaking core change before 1.0 does the same',
      [commit('d1', 'feat!: drop an option', file(CORE))],
      { core: '0.7.0', ngx: '0.5.2', released: [CORE, NGX] }
    ],
    [
      'changes to both give each its own bump',
      [
        commit('d2', 'feat: an Angular feature', file(NGX)),
        commit('d1', 'fix: a core fix', file(CORE))
      ],
      { core: '0.6.1', ngx: '0.6.0', released: [CORE, NGX] }
    ]
  ]) {
    const state = releasedAt(start, ...changes);
    const pullRequest = await pullRequestFor(state);
    check(pullRequest, `a release PR: ${what}`);
    const { merged, versions, range } = outcome(state.files, pullRequest);
    check(
      versions[CORE.component] === expected.core &&
        versions[NGX.component] === expected.ngx,
      `${what}: the core at ${expected.core} and the Angular package at ${expected.ngx}, got ${JSON.stringify(versions)}`
    );
    check(
      range === `^${expected.core}`,
      `${what}: the Angular package on ^${expected.core}, got ${range}`
    );
    if (expected.released.includes(CORE)) {
      const ngxEntry = entry(merged, NGX, expected.ngx);
      check(
        ngxEntry.includes(
          `${CORE.name} bumped from ^${start[CORE.component]} to ^${expected.core}`
        ),
        `${what}: the dependency update in the Angular package's changelog, got ${JSON.stringify(ngxEntry)}`
      );
    }
    const tags = await releasesAfter(state, pullRequest);
    const tagsExpected = tagsOf(
      ...expected.released.map((pkg) => [
        pkg,
        pkg === CORE ? expected.core : expected.ngx
      ])
    );
    check(
      JSON.stringify(tags) === JSON.stringify(tagsExpected),
      `${what}: merging to create ${tagsExpected.join(', ')}; got ${tags.join(', ')}`
    );
    const core =
      expected.core === start[CORE.component]
        ? `core unchanged at ${expected.core}`
        : `core ${start[CORE.component]} → ${expected.core}`;
    console.log(
      `✔ ${what}: ${core}, Angular ${start[NGX.component]} → ${expected.ngx} on ^${expected.core}`
    );
  }

  const quiet = releasedAt(
    start,
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
