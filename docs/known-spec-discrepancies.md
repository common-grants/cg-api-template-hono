# Known spec-check discrepancies

`pnpm check:spec` exports the OpenAPI document this API serves and compares it
with the CommonGrants base protocol using
[`@common-grants/cli`](https://www.npmjs.com/package/@common-grants/cli).

**It currently exits non-zero, and that is expected.** This page records what
it reports, why, and what would have to change to make it clean.

The check is therefore **advisory** and manual. It is not part of `pnpm run ci`
or the pull-request workflow.

## What "advisory" does and does not mean

The checker compares two _documents_. It is a structural diff, not a
conformance certificate:

- A clean run would not prove the API behaves correctly. The runtime tests do
  that.
- A failing run does not prove the API is wrong. Most of what it reports below
  is drift between the SDK's Zod schemas and the base protocol's TypeSpec —
  two renderings of the same model, not two different models.

Do not suppress it, and do not post-process the exported document to make it
pass. The report is useful precisely because it is unedited.

## Current result

Measured locally on Node 24.20.0 against `@common-grants/sdk@0.7.2` and
`@common-grants/cli@0.4.0`:

```
Validation error: Spec validation failed:
101 errors
```

That count is **dated evidence, not an allowlist and not a target**. It moves
whenever the SDK, the CLI or the base protocol moves. Re-measure rather than
assuming.

Every one of the 101 findings falls into one of four groups.

### 1. Nullable drift (61 findings)

```
Location: .items[0].funding.details
Message: Type mismatch. Base is 'string', impl is 'string | null'
```

The SDK declares optional fields with Zod's `.nullish()`, which renders as
`type: ["string", "null"]`. The base protocol's TypeSpec declares them optional
but not nullable. Every optional field on the opportunity model reports once
per route that returns it.

This is SDK-versus-base drift. Fixing it means changing one of those two
sources, not this template.

### 2. Custom filter operators (20 findings)

```
Location: .filters.customFilters[prop].operator
Message: Enum mismatch. Extra value 'between' in implementation not allowed by base spec
```

`OppFiltersSchema.customFilters` is typed with the SDK's `DefaultFilterSchema`,
whose `operator` is the union of every filter operator. The base protocol
allows a narrower set at that position. Ten operators × two locations
(`filters` in the request, `filterInfo.filters` in the response).

This template implements no custom filters at all — it reports any it receives
as ignored in `filterInfo.errors` — so the wider enum is inherited from the
SDK's type, not a capability being claimed.

### 3. Event union required properties (18 findings)

```
Location: .items[0].keyDates.closeDate.name
Message: Missing required property 'name'
```

`EventSchema` is a discriminated union of three event types, which renders as
`oneOf`. The checker evaluates required properties against the union as a whole
rather than per branch, so each branch appears to be missing the other
branches' required fields. Three properties × three date positions
(`postDate`, `closeDate`, `otherDates[prop]`) × two routes.

This is a checker limitation with `oneOf`, not a schema defect. The served
documents' branches are individually correct.

### 4. Nullable `sortOrder` and the literal 404 status (2 findings)

```
Location: .sorting.sortOrder
Message: Enum mismatch. Extra value 'null' in implementation not allowed by base spec

Location: .status   (GET /common-grants/opportunities/{oppId}, 404 response)
Message: Type mismatch. Base is 'integer', impl is 'number'
```

The first is the SDK's own internal drift, and it is worth knowing about
because it also affects behavior: `OppSortingSchema.sortOrder` is `.nullish()`
on the request side, while `SortedResultsInfoSchema.sortOrder` is **required**
on the response side. A pass-through implementation cannot satisfy both. This
template accepts the nullable input and normalizes it to a concrete direction
before executing and before reporting — see `resolveSorting()` in
`src/routes/opportunities.ts`.

The second is a rendering artifact: `NotFoundSchema.status` is
`z.literal(404)`, which zod-to-openapi renders as
`{"type": "number", "enum": [404]}` rather than `"integer"`.

## Automating the check

Make it a blocking check when — and only when — a real run comes back clean:

1. Re-run `pnpm check:spec` and read the report.
2. If findings remain, they belong upstream (SDK, CLI, or the base protocol),
   not in a local workaround here.
3. Once a run is genuinely clean, decide whether it belongs in
   `.github/workflows/ci.yml` and update this page.

Note that the closure of any single upstream issue is not by itself evidence
that the check now passes. Run it.

## The reviewed audit exception for the checker

The checker is `@common-grants/cli`, pinned to `0.4.0` in this project's
`devDependencies` and locked in `pnpm-lock.yaml`, so it and everything it pulls
in are inside the audited dependency graph.

One of those transitive dependencies, `@typespec/compiler`, carries a
high-severity advisory:
[GHSA-2q42-4q24-7rgv](https://github.com/advisories/GHSA-2q42-4q24-7rgv).

|                     |                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Advisory            | GHSA-2q42-4q24-7rgv (high)                                                                             |
| Affected packages   | `@typespec/compiler`, `@typespec/openapi3`                                                             |
| Vulnerable range    | `<= 1.15.0`                                                                                            |
| Locked version here | `@typespec/compiler` 1.15.0, via `@common-grants/cli`                                                  |
| Patched release     | **None available.** The advisory lists no patched version, and 1.15.0 is the latest published release. |

That advisory is excepted, and **only** that advisory, in
`pnpm-workspace.yaml`:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-2q42-4q24-7rgv
```

Declaring it in the file rather than passing `pnpm audit --ignore <id>`
is deliberate: that flag _writes_ the id into `pnpm-workspace.yaml` rather
than filtering a single run, so using it in CI would have the gate rewrite
a tracked file on every build.

### Why it is safe here

The advisory concerns a malicious TypeSpec `version` value escaping
`emitterOutputDir` and overwriting YAML or JSON files outside the output tree.
Reaching it requires compiling TypeSpec.

This project never compiles TypeSpec. It uses exactly one CLI command,
`cg check spec dist/openapi.json`, and that command's path in the released
`0.4.0` artifact is:

`dist/index.js` → `checkCommand` → the `check spec` action →
`DefaultCheckService.checkSpec` → load and parse two OpenAPI documents (JSON or
YAML) → dereference → compare → report.

**The compiler is never loaded or executed by this command.** One detail is
worth stating precisely, because it is easy to overstate: `dist/index.js`
registers every command at startup, which does load `dist/utils/typespec.js`,
and that module runs `require.resolve(".bin/tsp")` at import. So the `tsp`
binary's _path_ is resolved on every `cg` invocation, `check spec` included.

Resolving a path is not loading a module. `require.resolve` returns a string
and evaluates nothing. `dist/utils/typespec.js` is imported only by
`init-service.js` and `compile-service.js`, and both of those reach TypeSpec by
`spawn`ing a **separate** `node` process for that binary, from inside their
action callbacks — and registering a command does not run its callback.

Measured on the installed `0.4.0` artifact while driving
`cg check spec dist/openapi.json`: `check-service.js`, `compile-service.js` and
`utils/typespec.js` are all in `require.cache`; the count of loaded
`node_modules/@typespec/*` modules is **0**, before and after `tspBinPath` is
resolved. The vulnerable emitter code is never brought into the process, which
is what the exception rests on.

### What the exception does not do

- It does not raise the severity threshold. The gate is still
  `--audit-level high`.
- It does not suppress anything else. Any other high or critical finding fails
  `pnpm run audit`.
- It does not tolerate an unreachable audit service. `--ignore-registry-errors`
  is not used anywhere in this repository, so a registry or audit-service error
  fails the gate.
- It does not make the graph clean. `pnpm audit` still reports
  `1 high (1 ignored)`. The exception and affected locked versions remain
  documented in `pnpm-workspace.yaml` and on this page.

Those three properties were verified with isolated controlled checks rather
than assumed:

| Check                                                                                                 | Result                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm audit --audit-level moderate` in this repo, exception active                                    | exits 1 — the two unrelated `qs` moderates still fail, so the exception is scoped to one advisory       |
| `pnpm run audit` twice in a row                                                                       | `pnpm-workspace.yaml` is byte-identical afterwards — the gate reads the exception, it never rewrites it |
| A throwaway project carrying the same exception plus dependencies with known high/critical advisories | exits 1 — `pnpm run audit` still blocks a non-excepted high                                             |
| The same throwaway project run against an unreachable registry                                        | exits 1 — an audit-service failure still blocks                                                         |

### Reassessment and removal

- Reassess periodically and on any change to `@common-grants/cli` or its
  TypeSpec dependencies. The CLI is pinned to an exact version so every change
  requires a deliberate manifest and lockfile update.
- Remove the exception as soon as a patched `@typespec/compiler` reaches a
  published CLI release. Delete the `auditConfig` block and confirm
  `pnpm run audit` still passes.
- **The assessment is invalidated** if this project ever compiles TypeSpec,
  adds the OpenAPI emitter, or uses `cg init` or `cg compile`. Redo it before
  adding any of those, rather than carrying the exception forward.
