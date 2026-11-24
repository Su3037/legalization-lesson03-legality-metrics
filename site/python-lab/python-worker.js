// Pyodide and every exercise asset are served from this site, not a public execution API.
import {loadPyodide} from './vendor/pyodide.mjs';
let runtime;
let activeId;
let printed = 0;
let buffer = '';
const flushOutput = () => {
  if (buffer) self.postMessage({id: activeId, type: 'stdout', text: buffer.replace(/\n$/, '')});
  buffer = '';
};
const send = (type, text) => {
  if (printed < 60000) {
    const limited = (String(text) + '\n').slice(0, 60000 - printed);
    printed += limited.length;
    buffer += limited;
    if (buffer.length >= 1024) flushOutput();
  }
};
async function initialize() {
  // Detect a missing/offline runtime before Emscripten waits for initialization.
  // All files are static, same-origin assets and GitHub Pages supports HEAD.
  await Promise.all(['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'].map(async file => {
    const check = await fetch(new URL(`./vendor/${file}`, import.meta.url), {method: 'HEAD'});
    if (!check.ok) throw new Error(`Python runtime ${file}: HTTP ${check.status}`);
  }));
  const response = await fetch(new URL('./exercise.json', import.meta.url));
  if (!response.ok) throw new Error(`Exercise data: HTTP ${response.status}`);
  const exercise = await response.json();
  const py = await loadPyodide({
    indexURL: new URL('./vendor/', import.meta.url).href,
    stdout: text => send('stdout', text), stderr: text => send('stderr', text),
  });
  py.FS.mkdirTree('/lesson/fixtures');
  py.FS.writeFile('/lesson/grader.py', exercise.grader);
  py.FS.writeFile('/lesson/runner.py', exercise.runner);
  py.FS.writeFile('/lesson/fixtures/cases.json', JSON.stringify(exercise.fixtures));
  py.runPython("import sys, os\nsys.path.insert(0, '/lesson')\nos.chdir('/lesson')");
  return py;
}
self.onmessage = async ({data: {id, mode, source}}) => {
  activeId = id; printed = 0; buffer = '';
  try {
    runtime ??= initialize();
    const py = await runtime;
    self.postMessage({id, type: 'ready', mode});
    py.globals.set('__lesson_source', source);
    py.globals.set('__lesson_mode', mode);
    const encoded = await py.runPythonAsync('import runner\nrunner.execute(__lesson_source, __lesson_mode)');
    py.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
    flushOutput();
    self.postMessage({id, type: 'result', result: JSON.parse(encoded)});
  } catch (error) {
    flushOutput();
    self.postMessage({id, type: 'error', error: String(error.message || error)});
  }
};
