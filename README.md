# Dave API — BrowserStack Coverage Engine

A small Express app that sits on top of the [BrowserStack Test Management API v2](https://test-management.browserstack.com/api/v2) and answers one question: **which test cases in a project have *not* been executed in a given test run?**

It serves a single-page dashboard ([index.html](index.html)) for browsing that "coverage delta" interactively, plus a couple of standalone CLI scripts for the same check from the terminal.

## How it's put together

| File | Role |
|---|---|
| [server.js](server.js) | Express server. Proxies/aggregates BrowserStack API calls and serves the dashboard. **This is what `npm start` runs.** |
| [index.html](index.html) | Static dashboard UI (project/run pickers, executed vs. unexecuted panels, filters, run creation). Talks only to the `/api/*` routes below — never to BrowserStack directly. |
| [browserstackUtils.js](browserstackUtils.js) | Standalone helper, `getUnexecutedTestCases(username, accessKey, projectId, testRunId)`. Used by [index.js](index.js), not by the server. |
| [index.js](index.js) | CLI script: prints a table of unexecuted test cases for a hardcoded project/run using `browserstackUtils.js`. |
| [check-tests.js](check-tests.js) | Self-contained CLI script that does the same coverage check inline (no shared helper), with console-logged output instead of a table. |


## API reference (server.js)

All routes are prefixed with `/api` and proxy to BrowserStack's `/projects/...` endpoints using Basic Auth built from `USERNAME`/`ACCESS_KEY`.

| Method | Route | Responsible for |
|---|---|---|
| `GET` | `/` | Serves the dashboard ([index.html](index.html)). |
| `GET` | `/api/projects` | Lists all BrowserStack Test Management projects, for the "Project" picker. |
| `GET` | `/api/projects/:projectId/test-runs` | Lists test runs within a project, for the "Test Run" picker. Query params are passed straight through to BrowserStack. |
| `GET` | `/api/projects/:projectId/test-cases` | Direct proxy to BrowserStack's test-cases endpoint (debug/inspection tool; not paginated by the server). |
| `GET` | `/api/projects/:projectId/runs/:testRunId/coverage` | **The core endpoint.** Fetches the run's metadata, fetches *every* test case in the project (auto-paginated), and diffs them to compute: `executedCases`, `unexecutedCases`, a merged `testCaseDetails` map, and `runMeta` (name, state, pass/fail counts, progress, tags, etc.). This is what powers the two dashboard panels and the stats row. |
| `POST` | `/api/projects/:projectId/test-runs` | Creates a new test run in BrowserStack. Used by the dashboard's "Create Run" action when the user selects unexecuted cases to re-run. |
| `PATCH` | `/api/projects/:projectId/test-runs/:testRunId` | Updates an existing test run (e.g. adding cases to it) via BrowserStack's `/update` endpoint. |

Internal helpers:
- `bsFetch(path, opts)` — wraps `fetch` with auth headers and throws a structured error (with `status`/`body`) on non-2xx responses.
- `fetchAllPages(basePath, extractItems, pageSize)` — walks BrowserStack's `page`/`page_size` pagination until it runs out of pages, used to pull the *entire* test-case list for a project.

## Setup

1. Fill in `.env` (already present in the repo root, values currently blank):
   ```
   BROWSERSTACK_USERNAME=your_username
   BROWSERSTACK_ACCESS_KEY=your_access_key
   ```
2. Install dependencies and start the server, loading `.env` via Node's built-in flag (Node 20.6+):
   ```bash
   npm install
   node --env-file=.env server.js
   ```
   `npm start` (`node server.js`) will **not** pick up `.env` on its own — [server.js](server.js) reads `process.env` directly and doesn't load any `.env` file itself, so either use the `--env-file` flag above or export the vars in your shell first.

Then open `http://localhost:3000`.

