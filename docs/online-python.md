# Online Python lab

Open the public lesson and select section **08 / Python**:

https://su3037.github.io/legalization-lesson03-legality-metrics/#python

Visitors can edit Python, run their scripts, and test their implementation
against all **24 existing exercise cases** without installing Python,
downloading a package, signing in, or connecting to the author's Mac.

The original offline package remains available under the optional download
disclosure. Both surfaces use `python/exercise/starter.py`, `check.py`,
`reference.py` and the same fixture JSON.

## Behavior

- Run real CPython through pinned, same-origin Pyodide/WebAssembly in a module
  worker. The first execution downloads about 13 MB; later loads use normal
  browser caching. Nothing is sent to an execution server.
- Print output and Python tracebacks are displayed as text. The editor supports
  Ctrl/Cmd+Enter, draft persistence, `.py` import/export, restoring the starter
  and undoing that restoration.
- Reference code can be inspected and tested independently without replacing
  the learner's editor. The result explicitly identifies reference study mode.
- Unimplemented functions remain **incomplete**, never passed. Incorrect
  implementations show failing fixture names and diagnostics.
- Each run gets a fresh module namespace. Stop terminates the worker; a
  ten-second execution limit also terminates runaway code. The next run
  creates a fresh runtime while preserving the editor. Initialization has a
  separate 90-second loading deadline and recoverable error messages.
- Output is bounded to 60 KB. Tests are educational feedback rather than a
  tamper-proof examination service.

## Build and verification

```sh
python3 scripts/build-python-lab.py
node scripts/build-site.mjs
node tests/browser-python.mjs
# Test the deployed version instead:
SITE_URL=https://su3037.github.io/legalization-lesson03-legality-metrics/ node tests/browser-python.mjs
```

The build regenerates `site/python-lab/exercise.json` from the original Python
sources, fixtures and browser adapter; keep it committed. The application and
worker resolve their assets relative to their own module URLs, preserving the
GitHub Pages project subpath.

The browser test uses real WASM and checks correct/incorrect programs, the
original case count, syntax errors, literal output, fresh namespaces, storage,
files, cancellation, timeout recovery, loading failure/retry and phone layout.
It writes `build/python-browser-report.json` and diagnostic screenshots. CI
and post-deployment checks run it alongside the existing site tests.

Runtime provenance, exact file hashes and licenses are in
`site/python-lab/vendor/`. The browser executes locally; serving these static
files does not require a Python backend or the author's development server.
