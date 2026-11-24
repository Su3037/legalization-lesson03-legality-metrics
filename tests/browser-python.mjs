// Real WASM execution on the real lesson page. No mocked Python or grading.
// SITE_URL=<deployed Pages URL> node tests/browser-python.mjs
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync, createReadStream, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';

const pkg = JSON.parse(readFileSync('package.json'));
const legal = pkg.name.startsWith('legalization');
const prefix = `/${pkg.name}/`;
const files = resolve(legal ? 'dist' : 'site');
let server;
let url = process.env.SITE_URL;
if (!url) {
  const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm', '.css':'text/css', '.json':'application/json', '.vtt':'text/vtt', '.woff2':'font/woff2', '.mp4':'video/mp4', '.png':'image/png'};
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const relative = path.startsWith(prefix) ? path.slice(prefix.length) : '../invalid';
    const f = resolve(files, relative || 'index.html');
    if (!f.startsWith(files + '/') || relative.includes('..')) { res.writeHead(404).end(); return; }
    let st; try { st = statSync(f); } catch { res.writeHead(404).end(); return; }
    if (!st.isFile()) { res.writeHead(404).end(); return; }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), st.size-1) : st.size-1;
    if (start > end) { res.writeHead(416).end(); return; }
    res.writeHead(range ? 206 : 200, {'Content-Type': types[extname(f)] || 'application/octet-stream', 'Content-Length': end-start+1, 'Accept-Ranges':'bytes', ...(range ? {'Content-Range':`bytes ${start}-${end}/${st.size}`} : {})});
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(f, {start, end}); stream.pipe(res); res.on('close', () => stream.destroy());
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}${prefix}`;
}
const browser = await chromium.launch(process.env.BROWSER_PROXY ? {proxy:{server:process.env.BROWSER_PROXY}} : {});
const checks = [];
const ok = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
try {
  const ctx = await browser.newContext({viewport:{width:1280,height:900}, reducedMotion:'reduce'});
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const requests = [];
  page.on('request', r => { if (r.url().includes('/python-lab/')) requests.push(r.url()); });
  await page.goto(url, {waitUntil:'domcontentloaded'});
  const root = page.locator('[data-python-lab][data-ready="true"]'); await root.waitFor();
  const editor = root.locator('[data-py="editor"]');
  const output = root.locator('[data-py="output"]');
  const config = await (await page.request.get(new URL('python-lab/exercise.json', url).href)).json();
  const count = config.fixtures.cases.length;
  const waitDone = () => page.waitForFunction(() => {
    const r = document.querySelector('[data-python-lab]');
    return r.dataset.result || ['pass','fail','incomplete','error'].includes(r.dataset.state);
  }, null, {timeout:90000});
  const run = async code => { await editor.fill(code); await root.locator('[data-py="run"]').click(); await waitDone(); };
  ok('runtime is lazy-loaded', !requests.some(u => u.endsWith('.wasm')));
  await run('print(sum(i*i for i in range(5)))');
  ok('actual Python executes user code', (await output.innerText()).trim() === '30' || assert.fail(`Python output: ${await output.innerText()}`));
  ok('runtime comes from this site', requests.filter(u => /vendor\//.test(u)).every(u => new URL(u).origin === new URL(url).origin));
  await run('def broken(:\n    pass');
  ok('syntax error includes Python traceback', /SyntaxError/.test(await output.innerText()));
  await run('print("<img src=x onerror=alert(1)>")');
  ok('program output is text, not HTML', (await output.innerText()).includes('<img') && await output.locator('img').count() === 0);
  await editor.fill(config.starter);
  await root.locator('[data-py="test"]').click(); await waitDone();
  ok('unfinished starter never passes', await root.getAttribute('data-state') === 'incomplete');
  ok('original fixture count is preserved', await root.locator('tbody tr').count() === count);
  await root.locator('.python-reference summary').click();
  const prior = await editor.inputValue();
  await root.locator('[data-py="reference"]').click(); await waitDone();
  ok('reference passes every original case', await root.getAttribute('data-state') === 'pass' && await root.locator('tr[data-status="pass"]').count() === count);
  ok('reference study does not overwrite student code', await editor.inputValue() === prior);
  await editor.fill(config.reference);
  await root.locator('[data-py="test"]').click(); await waitDone();
  ok('tests evaluate the editor implementation', await root.getAttribute('data-state') === 'pass');
  const wrong = legal ? config.reference.replace('return to_dbu(xa) < to_dbu(xb + wb) and to_dbu(xb) < to_dbu(xa + wa)', 'return True') : config.reference.replace('return i, j', 'return 0, 0');
  assert.notEqual(wrong, config.reference);
  await editor.fill(wrong); await root.locator('[data-py="test"]').click(); await waitDone();
  ok('a deliberately incorrect implementation fails', await root.getAttribute('data-state') === 'fail' && await root.locator('tr[data-status="fail"]').count() > 0);
  await run('temporary_variable_123 = 1');
  await run('print("temporary_variable_123" in globals())');
  ok('each run uses a fresh Python namespace', (await output.innerText()).trim() === 'False');
  await editor.fill('print("saved draft")');
  await page.reload({waitUntil:'domcontentloaded'}); await root.waitFor();
  ok('draft survives a page reload', await editor.inputValue() === 'print("saved draft")');
  await root.locator('[data-py="reset"]').click();
  ok('starter can be restored', await editor.inputValue() === config.starter);
  await root.locator('[data-py="undo"]').click();
  ok('restoring the starter is undoable', await editor.inputValue() === 'print("saved draft")');
  await root.locator('[data-py="upload"]').setInputFiles({name:'imported.py',mimeType:'text/plain',buffer:Buffer.from('print("import works")')});
  await page.waitForFunction(() => document.querySelector('[data-py="editor"]').value === 'print("import works")');
  ok('Python files can be imported', await editor.inputValue() === 'print("import works")');
  const downloadEvent = page.waitForEvent('download'); await root.locator('[data-py="download"]').click();
  ok('Python code can be exported', (await downloadEvent).suggestedFilename() === config.filename);
  await editor.fill('while True:\n    pass'); await root.locator('[data-py="run"]').click();
  await page.waitForFunction(() => document.querySelector('[data-python-lab]').dataset.state === 'running', null, {timeout:90000});
  await root.locator('[data-py="stop"]').click();
  ok('Stop terminates a busy worker and preserves code', await editor.inputValue() === 'while True:\n    pass' && await root.locator('[data-py="run"]').isEnabled());
  await run('print("recovered")');
  ok('execution recovers after Stop', (await output.innerText()).trim() === 'recovered');
  await run('while True:\n    pass');
  ok('a runaway program times out without freezing the UI', await root.getAttribute('data-state') === 'error' && /10/.test(await root.locator('[data-py="status"]').innerText()));
  await run('print(42)');
  ok('execution recovers after timeout', (await output.innerText()).trim() === '42');
  await editor.fill(config.reference); await root.locator('[data-py="test"]').click(); await waitDone();
  await page.setViewportSize({width:390,height:844}); await root.scrollIntoViewIfNeeded();
  ok('editor is usable at phone width', await editor.evaluate(e => e.getBoundingClientRect().width <= 390));
  mkdirSync('build', {recursive:true}); await root.screenshot({path:'build/python-lab-mobile.png'});
  await page.setViewportSize({width:1280,height:900}); await root.screenshot({path:'build/python-lab-desktop.png'});
  // A fresh context tests real load failure rather than an already cached interpreter.
  const failureContext = await browser.newContext({reducedMotion:'reduce'});
  await failureContext.route('**/python-lab/vendor/pyodide.asm.wasm', r => r.abort());
  const p = await failureContext.newPage(); p.setDefaultTimeout(15000);
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('[data-python-lab][data-ready="true"]').waitFor();
  await p.locator('[data-py="editor"]').fill('print(7)');await p.locator('[data-py="run"]').click();
  await p.waitForFunction(()=>document.querySelector('[data-python-lab]').dataset.state==='error',null,{timeout:90000});
  ok('runtime loading failure is visible and recoverable', await p.locator('[data-py="run"]').isEnabled());
  await failureContext.unroute('**/python-lab/vendor/pyodide.asm.wasm');await p.locator('[data-py="run"]').click();
  await p.waitForFunction(()=>document.querySelector('[data-python-lab]').dataset.result==='run',null,{timeout:90000});
  ok('retry succeeds after a loading failure', (await p.locator('[data-py="output"]').innerText()).trim()==='7');
  await failureContext.close();
  if (!legal) {
    await page.goto(url + '?lang=en', {waitUntil:'domcontentloaded'}); await root.waitFor();
    ok('English edition also has the real editor', await root.locator('[data-py="run"]').innerText() === '▶ Run code');
  }
  const report = {passed:true,url,cases:count,checks};
  writeFileSync('build/python-browser-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,cases:count}));
} finally { await browser.close(); if (server) await new Promise(r => server.close(r)); }
