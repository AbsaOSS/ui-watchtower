/**
 * Snapshots the public API of each built package: every export of every
 * entry point, with its kind and its members and signatures as the
 * TypeScript checker resolves them from the published declarations. How a
 * type is built (inheritance, generics) doesn't show; what a consumer sees
 * does.
 *
 *   node scripts/api-snapshot.mjs           compare with the committed snapshots
 *   node scripts/api-snapshot.mjs --update  write them again
 *
 * Run through `npm run api:check` and `npm run api:update`, which build
 * first, so a stale dist/ never decides the result. Update only for an
 * intended API change, and review the diff.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGES = [
  {
    dist: 'dist/ui-watchtower',
    snapshot: 'projects/ui-watchtower/public-api.snapshot.json'
  },
  {
    dist: 'dist/ngx-ui-watchtower',
    snapshot: 'projects/ngx-ui-watchtower/public-api.snapshot.json'
  }
];
const FORMAT =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;

/** Each entry point's import path and declaration file. */
function entriesOf(dist) {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, dist, 'package.json'), 'utf8')
  );
  return Object.entries(manifest.exports)
    .filter(([, target]) => target.types)
    .map(([subpath, target]) => ({
      id: manifest.name + subpath.slice(1),
      file: join(ROOT, dist, target.types)
    }));
}

const entries = PACKAGES.flatMap((pkg) =>
  entriesOf(pkg.dist).map((entry) => ({ ...entry, pkg }))
);
const program = ts.createProgram(
  entries.map((entry) => entry.file),
  {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
    // The packages' imports of each other resolve to what was built.
    paths: Object.fromEntries(entries.map((e) => [e.id, [e.file]]))
  }
);
const checker = program.getTypeChecker();
const has = (symbol, flag) => (symbol.flags & flag) !== 0;
const text = (type) => checker.typeToString(type, undefined, FORMAT);

function modifiers(symbol) {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  return declaration ? ts.getCombinedModifierFlags(declaration) : 0;
}

/** `<T extends …>`, as declared. */
function typeParameters(symbol) {
  const declaration = symbol.declarations?.find((d) => d.typeParameters);
  return declaration
    ? `<${declaration.typeParameters.map((p) => p.getText()).join(', ')}>`
    : '';
}

function signatures(type, kind, prefix) {
  return checker
    .getSignaturesOfType(type, kind)
    .map((s) => prefix + checker.signatureToString(s, undefined, FORMAT));
}

/** The public and protected members of `type`, one line each, sorted. */
function members(type, prefix = '') {
  const lines = checker.getPropertiesOfType(type).flatMap((member) => {
    const flags = modifiers(member);
    // `ɵ` members (ɵfac, ɵprov, ɵcmp…) are Angular's internals: not public
    // API, and free to change between minor versions.
    if (
      flags & ts.ModifierFlags.Private ||
      member.name.startsWith('#') ||
      member.name.startsWith('__#') ||
      member.name.startsWith('ɵ') ||
      member.name === 'prototype'
    ) {
      return [];
    }
    const tags =
      prefix +
      (flags & ts.ModifierFlags.Protected ? 'protected ' : '') +
      (flags & ts.ModifierFlags.Abstract ? 'abstract ' : '') +
      (flags & ts.ModifierFlags.Readonly ? 'readonly ' : '');
    const optional = has(member, ts.SymbolFlags.Optional) ? '?' : '';
    const memberType = checker.getTypeOfSymbol(member);
    if (has(member, ts.SymbolFlags.Method)) {
      // An optional method's type includes `undefined`, which has none.
      return signatures(
        checker.getNonNullableType(memberType),
        ts.SignatureKind.Call,
        `${tags}${member.name}${optional}`
      );
    }
    const accessor = [
      has(member, ts.SymbolFlags.GetAccessor) ? 'get' : '',
      has(member, ts.SymbolFlags.SetAccessor) ? 'set' : ''
    ]
      .filter(Boolean)
      .join('/');
    return [
      `${tags}${accessor ? accessor + ' ' : ''}${member.name}${optional}: ${text(memberType)}`
    ];
  });
  const indexes = checker
    .getIndexInfosOfType(type)
    .map(
      (info) =>
        `${prefix}${info.isReadonly ? 'readonly ' : ''}[key: ${text(info.keyType)}]: ${text(info.type)}`
    );
  return [...lines, ...indexes].sort();
}

/** How one export looks to a consumer: its kind, then its shape. */
function describe(exported) {
  const symbol = has(exported, ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(exported)
    : exported;
  const typeOnly = (exported.declarations ?? []).some(
    (d) =>
      ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly)
  );
  const only =
    typeOnly && has(symbol, ts.SymbolFlags.Value) ? 'type-only ' : '';
  const generics = typeParameters(symbol);
  if (has(symbol, ts.SymbolFlags.Class)) {
    const abstract = modifiers(symbol) & ts.ModifierFlags.Abstract;
    const statics = checker.getTypeOfSymbol(symbol);
    return [
      `${only}${abstract ? 'abstract ' : ''}class${generics}`,
      ...signatures(statics, ts.SignatureKind.Construct, 'new '),
      ...members(statics, 'static '),
      ...members(checker.getDeclaredTypeOfSymbol(symbol))
    ];
  }
  if (has(symbol, ts.SymbolFlags.Interface)) {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    return [
      `${only}interface${generics}`,
      ...signatures(type, ts.SignatureKind.Call, ''),
      ...signatures(type, ts.SignatureKind.Construct, 'new '),
      ...members(type)
    ];
  }
  if (has(symbol, ts.SymbolFlags.TypeAlias)) {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    return [
      `type${generics} = ${checker.typeToString(type, undefined, FORMAT | ts.TypeFormatFlags.InTypeAlias)}`
    ];
  }
  if (has(symbol, ts.SymbolFlags.Function)) {
    return signatures(
      checker.getTypeOfSymbol(symbol),
      ts.SignatureKind.Call,
      `${only}function`
    );
  }
  if (has(symbol, ts.SymbolFlags.Variable)) {
    const readonly =
      ts.getCombinedNodeFlags(symbol.valueDeclaration) & ts.NodeFlags.Const;
    return [
      `${only}${readonly ? 'const' : 'let'}: ${text(checker.getTypeOfSymbol(symbol))}`
    ];
  }
  throw new Error(`Unexpected export kind: ${exported.name}`);
}

function snapshotOf(entry) {
  const source = program.getSourceFile(entry.file);
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) {
    throw new Error(`Cannot read ${entry.file}; run npm run build first`);
  }
  return Object.fromEntries(
    checker
      .getExportsOfModule(module)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((exported) => [exported.name, describe(exported)])
  );
}

const update = process.argv.includes('--update');
let failed = false;
for (const pkg of PACKAGES) {
  const actual =
    JSON.stringify(
      Object.fromEntries(
        entries
          .filter((entry) => entry.pkg === pkg)
          .map((entry) => [entry.id, snapshotOf(entry)])
      ),
      null,
      2
    ) + '\n';
  const file = join(ROOT, pkg.snapshot);
  const expected = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (update) {
    writeFileSync(file, actual);
    console.log(`Wrote ${pkg.snapshot}`);
  } else if (actual !== expected) {
    failed = true;
    writeFileSync(`${file}.actual`, actual);
    console.error(
      `${pkg.snapshot} differs from the build; see ${pkg.snapshot}.actual.\n` +
        'Run npm run api:update only if the API change is intended.'
    );
  } else {
    console.log(`${pkg.snapshot} matches the build`);
  }
}
process.exitCode = failed ? 1 : 0;
