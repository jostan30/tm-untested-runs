// index.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// ─────────────────────────────────────────────
//  CONFIGURATION  (fill in your credentials)
// ─────────────────────────────────────────────
const USERNAME   = process.env.BROWSERSTACK_USERNAME;
const ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;
const BASE_URL   = "https://test-management.browserstack.com/api/v2";

if (!USERNAME || !ACCESS_KEY) {
  console.warn("⚠️  BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY not set. Set them as env vars or edit index.js.");
}

const authHeader = `Basic ${Buffer.from(`${USERNAME}:${ACCESS_KEY}`).toString('base64')}`;
const bsHeaders  = {
  "Content-Type" : "application/json",
  "Authorization": authHeader,
};

// ─────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());

// Serve the HTML dashboard at /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Fetch a BrowserStack API endpoint, throw on HTTP error.
 */
async function bsFetch(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const res  = await fetch(url, { ...opts, headers: { ...bsHeaders, ...(opts.headers || {}) } });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`BrowserStack API error ${res.status} for ${url}`),
      { status: res.status, body }
    );
  }
  return res.json();
}

/**
 * Fetch ALL pages of a paginated endpoint.
 * BrowserStack uses ?page=N&page_size=30 and returns an `info` object.
 * `extractItems(data)` should return the array of items from each page.
 */
async function fetchAllPages(basePath, extractItems, pageSize = 100) {
  let page  = 1;
  let items = [];

  while (true) {
    const sep  = basePath.includes('?') ? '&' : '?';
    const data = await bsFetch(`${basePath}${sep}page=${page}&page_size=${pageSize}`);
    const batch = extractItems(data) || [];
    items.push(...batch);

    const info = data.info || {};
    // Stop when we've consumed all pages
    if (!info.next || batch.length < pageSize) break;
    page++;
  }

  return items;
}

// ─────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────

// GET /api/projects
// Returns list of projects.
app.get('/api/projects', async (req, res) => {
  try {
    const data = await bsFetch('/projects');
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/test-runs
app.get('/api/projects/:projectId/test-runs', async (req, res) => {
  try {
    const qs   = new URLSearchParams(req.query).toString();
    const path = `/projects/${req.params.projectId}/test-runs${qs ? '?' + qs : ''}`;
    const data = await bsFetch(path);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/runs/:testRunId/coverage
app.get('/api/projects/:projectId/runs/:testRunId/coverage', async (req, res) => {
  try {
    const { projectId, testRunId } = req.params;

    const runData = await bsFetch(`/projects/${projectId}/test-runs/${testRunId}`);
    const runMeta = runData.test_run || {};

    const allProjectCases = await fetchAllPages(
      `/projects/${projectId}/test-cases`,
      d => d.test_cases
    );

    const executedCases = runMeta.test_cases || [];
    const executedIdentifiers = new Set(executedCases.map(tc => tc.identifier));

    const unexecutedCases = allProjectCases.filter(
      tc => !executedIdentifiers.has(tc.identifier)
    );

    const tcDetailsMap = {};

    for (const tc of allProjectCases) {
      tcDetailsMap[tc.identifier] = tc;
    }

    for (const tc of executedCases) {
      if (tcDetailsMap[tc.identifier]) {
        Object.assign(tcDetailsMap[tc.identifier], {
          latest_status   : tc.latest_status,
          configuration_id: tc.configuration_id,
          latest_result_id: tc.latest_result_id,
        });
      } else {
        tcDetailsMap[tc.identifier] = { ...tc };
      }
    }

    res.json({
      executedCases,
      unexecutedCases,
      testCaseDetails: Object.values(tcDetailsMap),
      runMeta: {
        identifier       : runMeta.identifier,
        name             : runMeta.name,
        run_state        : runMeta.run_state,
        active_state     : runMeta.active_state,
        assignee         : runMeta.assignee,
        configurations   : runMeta.configurations,
        test_cases_count : runMeta.test_cases_count,
        overall_progress : runMeta.overall_progress,
        passed_count     : runMeta.passed_count,
        failed_count     : runMeta.failed_count,
        tags             : runMeta.tags,
        created_at       : runMeta.created_at,
        updated_at       : runMeta.updated_at,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message, detail: err.body });
  }
});

// POST /api/projects/:projectId/test-runs
// Creates a new test run.
app.post('/api/projects/:projectId/test-runs', async (req, res) => {
  try {
    const body = req.body.test_run ? req.body : { test_run: req.body };

    const data = await bsFetch(`/projects/${req.params.projectId}/test-runs`, {
      method : 'POST',
      body   : JSON.stringify(body),
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message, detail: err.body });
  }
});

// ─────────────────────────────────────────────
// NEW: PATCH /api/projects/:projectId/test-runs/:testRunId
// Updates an existing test run via partial parameters.
// ─────────────────────────────────────────────
app.patch('/api/projects/:projectId/test-runs/:testRunId', async (req, res) => {
  try {
    const { projectId, testRunId } = req.params;

    // Standardize incoming data into the structure required by BrowserStack
    const body = req.body.test_run ? req.body : { test_run: req.body };

    const data = await bsFetch(`/projects/${projectId}/test-runs/${testRunId}/update`, {
      method : 'PATCH',
      body   : JSON.stringify(body),
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message, detail: err.body });
  }
});

// GET /api/projects/:projectId/test-cases (Direct proxy debug tool)
app.get('/api/projects/:projectId/test-cases', async (req, res) => {
  try {
    const qs   = new URLSearchParams(req.query).toString();
    const path = `/projects/${req.params.projectId}/test-cases${qs ? '?' + qs : ''}`;
    const data = await bsFetch(path);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Coverage Engine running at http://localhost:${PORT}`);
  console.log(`    Username   : ${USERNAME || '(not set)'}`);
  console.log(`    Access Key : ${ACCESS_KEY ? '***' + ACCESS_KEY.slice(-4) : '(not set)'}\n`);
});