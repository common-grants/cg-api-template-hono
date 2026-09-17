# CommonGrants API template — Hono

A working [CommonGrants](https://commongrants.org) API you can run in about a
minute, then point at your own data.

It starts as a complete, self-contained service: three opportunity endpoints
backed by bundled sample data, every request and response validated with the
published [`@common-grants/sdk`](https://www.npmjs.com/package/@common-grants/sdk)
schemas, and an OpenAPI 3.1 document generated from those same schemas at
`/openapi.json`. Nothing is stubbed out and nothing is left as an exercise —
connecting your own data is one interface with three methods.

Built with [Hono](https://hono.dev) and
[`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi).

---

## Prerequisites

- **Node.js 24** — use whichever installation or version manager you prefer.
  The included [`.nvmrc`](.nvmrc) is available for `nvm` users.
- **pnpm 11.20.0** — the version is pinned in the `packageManager` field. If
  needed, `corepack enable` makes that pinned version available.

No project-specific global packages, credentials, database or infrastructure
are required.

## Get started

Click **Use this template** at the top of
[this repository](https://github.com/common-grants/cg-api-template-hono) to
create your own, then:

```bash
git clone https://github.com/<you>/<your-api>.git
cd <your-api>
node --version # must report v24.x
pnpm --version # must report 11.20.0
pnpm install
```

Check that everything works before you change anything:

```bash
pnpm run ci
```

That runs the static checks, the build, and the test suite with coverage.

> **Write `pnpm run ci`, not `pnpm ci`.** With pnpm 11, `pnpm ci` is a built-in
> alias for `clean-install`: it wipes `node_modules`, reinstalls from the
> lockfile, runs none of the checks, and exits 0. Only the `run` spelling
> invokes this project's script.

`pnpm run ci` is not everything the hosted CI runs — the dependency audit
(`pnpm run audit`) and the advisory spec check (`pnpm check:spec`) are separate
commands, so one of them going red never hides a failure in another.

Start the server on its default port, 3000, or choose another port if 3000 is
already in use:

```bash
# Default
pnpm dev

# Alternative
PORT=3001 pnpm dev
```

Then, in another terminal, make requests using the same port. The examples below
use the default:

```bash
# A page of opportunities, most recently modified first
curl 'http://localhost:3000/common-grants/opportunities?pageSize=2'

# Filtered and sorted search
curl -X POST http://localhost:3000/common-grants/opportunities/search \
  -H 'Content-Type: application/json' \
  -d '{"filters":{"status":{"operator":"in","value":["open"]}},"sorting":{"sortBy":"title"}}'

# The OpenAPI 3.1 document, generated from the same schemas
curl http://localhost:3000/openapi.json
```

## Connect your own data

The bundled sample data lives behind a three-method interface. Implement that
interface against your database or upstream API and the routes, validation and
OpenAPI document all keep working unchanged.

**→ [PORTING.md](PORTING.md) is the walkthrough.** It covers replacing the
repository, mapping your ids onto stable UUIDs, handling date-valued fields in
filters and sorts, adding custom fields in one file, and which tests to keep.

## Endpoints

| Method | Path                                   | Description                                        |
| ------ | -------------------------------------- | -------------------------------------------------- |
| `GET`  | `/common-grants/opportunities`         | Paginated list, most recent `lastModifiedAt` first |
| `GET`  | `/common-grants/opportunities/{oppId}` | One opportunity by id                              |
| `POST` | `/common-grants/opportunities/search`  | Filtered, sorted, paginated search                 |
| `GET`  | `/health`                              | Liveness check                                     |
| `GET`  | `/openapi.json`                        | The OpenAPI 3.1 document                           |

Every response — including errors — validates against a schema from
`@common-grants/sdk`. Requests that do not match their schema get a `400` in
the protocol's error shape; an unknown but well-formed id gets a `404` in the
protocol's not-found shape.

## Commands

| Command                     | What it does                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | Start the server with reload on change                                                             |
| `pnpm build`                | Compile to `dist/`                                                                                 |
| `pnpm start`                | Run the compiled server                                                                            |
| `pnpm test`                 | Run the test suite                                                                                 |
| `pnpm test:coverage`        | Run the tests with a coverage report                                                               |
| `pnpm checks`               | Lint, format check and typecheck (never writes files)                                              |
| `pnpm lint` / `pnpm format` | Apply lint and formatting fixes                                                                    |
| `pnpm export:openapi`       | Write the served document to `dist/openapi.json`                                                   |
| `pnpm check:spec`           | Compare that document against the base protocol                                                    |
| `pnpm run audit`            | The required dependency audit                                                                      |
| `pnpm run audit:report`     | Every severity, not just high. The one approved exception still applies and shows as `(1 ignored)` |
| `pnpm run ci`               | The static/build/test suite: `checks`, `build`, `test:coverage`                                    |

`pnpm check:spec` and `pnpm run audit` are deliberately **not** part of
`pnpm run ci`; the hosted CI runs all three independently. See
[docs/known-spec-discrepancies.md](docs/known-spec-discrepancies.md) for what
the spec check currently reports, why it is advisory, and for the one reviewed
audit exception this template carries.

## Structure

```
src/
  index.ts               Node entrypoint — the only file that knows about Node
  app.ts                 createApp({ repository }) — runtime-neutral factory
  http.ts                Shared error shapes
  routes/
    opportunities.ts     Route definitions, handlers, request/response validation
  data/
    schema.ts            The one opportunity schema — extend custom fields here
    repository.ts        The data seam: list / get / search
    fixtures.ts          Reference implementation over the bundled sample data
    opportunities.json   The bundled sample data
scripts/
  export-openapi.ts      Writes the served document to a file
test/                    Vitest suites: fixtures, app, routes, OpenAPI
```

## Maintenance

Projects created from this template are **independent**. There is no automatic
synchronization, no backports, and no source-maintainer responsibility for
derivative applications. You own your copy, including its dependency updates
and its `.github/` metadata — replace the issue templates and
contribution links with your own.

This template itself is maintained by Bryan, Kari and Laura, who review it
monthly. Dependabot proposes
updates on that same monthly schedule; nothing is auto-merged. A weekly job
probes the latest published SDK so a breaking release is noticed before it
lands in anyone's lockfile.

For how to keep your own copy current — and why updating your dependencies and
adopting template changes are two different jobs — see
[Keeping up to date](PORTING.md#8-keeping-up-to-date).

## Scope

This template is a starting point, not a framework. It deliberately ships
without a docs UI, deployment or auth recipes, a project generator, a live
database example, or release machinery. Add what your service needs.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[CC0 1.0 Universal](LICENSE). Dependencies keep their own licenses.
