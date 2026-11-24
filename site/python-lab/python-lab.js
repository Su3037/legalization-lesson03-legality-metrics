// A real, same-origin Pyodide editor. Python executes in a disposable module worker.
const STRINGS = {
  zh: {
    title: '在线 Python 实验', intro: '直接编辑代码，点击运行或用课程用例测试。不用安装 Python；代码在当前浏览器执行，草稿只保存在本机浏览器。',
    label: 'Python 代码编辑器', run: '运行代码', test: '测试我的代码', stop: '停止运行', reset: '恢复起始代码', undo: '撤销恢复',
    download: '导出 .py', upload: '导入 .py', ready: '就绪 · Ctrl / ⌘ + Enter 运行',
    loading: '正在加载浏览器 Python（首次约 13 MB，后续使用浏览器缓存）…', running: 'Python 正在运行…', testing: '正在测试…',
    output: '运行输出', results: '测试结果', none: '还没有运行。可以先展开下方示例，或完成 TODO 后测试。',
    noOutput: '运行完成，没有输出。使用 print(...) 查看结果，或点击“测试我的代码”。',
    testsNoOutput: '程序没有额外打印；请查看逐项测试结果。',
    stopped: '已停止。Python 引擎已重置，编辑器代码仍保留。', timeout: '运行超过 10 秒，已停止并重置 Python。请检查是否有无限循环，再次运行即可重试。',
    loadTimeout: 'Python 加载超时。请检查网络，稍后再次点击运行。', error: '运行错误', testsError: '测试未能完成',
    stale: '编辑器已有新改动；以下是上一次运行的结果。', saved: '草稿已保存在此浏览器', noSave: '浏览器存储不可用；离开前请导出代码。',
    reference: '参考实现（学习用，展开查看）', refTest: '验证参考实现', refLabel: '参考实现的测试（不是你的代码）',
    sample: '先试一个能运行的示例', sampleLoad: '把示例放入编辑器', source: '本次运行：编辑器中的代码',
    pass: '通过', fail: '失败', incomplete: '未完成', case: '用例', detail: '结果 / 错误说明', columnStatus: '状态',
    summary: (p, f, i, n) => `${p} / ${n} 通过 · ${f} 失败 · ${i} 未完成`,
    allPass: '全部测试通过', allTodo: '还有 TODO 未实现', failed: '有测试未通过',
    failedLoad: '练习资源加载失败', retry: '重新加载', importError: '请选择不超过 200 KB 的 .py 文本文件。',
    hint: 'Tab 可离开编辑器；缩进请用空格。运行期间也能修改代码，下次运行才会采用这些修改。',
  },
  en: {
    title: 'Online Python lab', intro: 'Edit, run and test Python here. No installation needed. Code runs in your browser; drafts stay in this browser.',
    label: 'Python code editor', run: 'Run code', test: 'Test my code', stop: 'Stop', reset: 'Restore starter', undo: 'Undo restore',
    download: 'Export .py', upload: 'Import .py', ready: 'Ready · Ctrl / ⌘ + Enter to run',
    loading: 'Loading browser Python (about 13 MB on first use, cached afterwards)…', running: 'Running Python…', testing: 'Testing…',
    output: 'Program output', results: 'Test results', none: 'No run yet. Try the runnable example below, or complete the TODOs and run the tests.',
    noOutput: 'Finished with no output. Use print(...) to see values, or select “Test my code”.',
    testsNoOutput: 'No additional program output. See the individual test results.',
    stopped: 'Stopped and reset Python. Your code is still in the editor.', timeout: 'Stopped after 10 seconds and reset Python. Check for an infinite loop, then run again.',
    loadTimeout: 'Python loading timed out. Check your connection and click Run to retry.', error: 'Execution error', testsError: 'Tests could not finish',
    stale: 'The editor has changed. These results belong to the previous run.', saved: 'Draft saved in this browser', noSave: 'Browser storage is unavailable. Export your code before leaving.',
    reference: 'Reference solution (study mode)', refTest: 'Test reference solution', refLabel: 'Reference solution results (not your code)',
    sample: 'Try a runnable example first', sampleLoad: 'Load example into editor', source: 'This run: code from the editor',
    pass: 'PASS', fail: 'FAIL', incomplete: 'TODO', case: 'Case', detail: 'Result / error details', columnStatus: 'Status',
    summary: (p, f, i, n) => `${p} / ${n} passed · ${f} failed · ${i} incomplete`,
    allPass: 'All tests passed', allTodo: 'Some TODOs are not implemented', failed: 'Some tests failed',
    failedLoad: 'Could not load exercise resources', retry: 'Retry loading', importError: 'Choose a .py text file no larger than 200 KB.',
    hint: 'Tab moves focus out of the editor; use spaces to indent. Edits made during execution take effect on the next run.',
  },
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function createPythonLab(root, {lang = 'zh'} = {}) {
  if (!root) return;
  const T = STRINGS[lang] || STRINGS.zh;
  root.classList.add('python-lab');
  root.textContent = T.loading;
  let config;
  try {
    const response = await fetch(new URL('./exercise.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    config = await response.json();
  } catch (error) {
    root.textContent = `${T.failedLoad}: ${error.message} `;
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = T.retry;
    retry.onclick = () => createPythonLab(root, {lang}); root.append(retry); return;
  }
  const id = `python-${config.id}`;
  const storageKey = `${id}-draft-v1`;
  root.innerHTML = `<div class="python-intro"><h3>${T.title}</h3><p>${T.intro}</p></div>
    <div class="python-toolbar"><button type="button" data-py="run">▶ ${T.run}</button><button type="button" data-py="test">✓ ${T.test}</button><button type="button" data-py="stop" disabled>■ ${T.stop}</button></div>
    <div class="python-editor-head"><label for="${id}-editor">${T.label} · ${escape(config.filename)}</label><span data-py="save" class="python-save"></span></div>
    <textarea id="${id}-editor" data-py="editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-describedby="${id}-hint" wrap="off"></textarea>
    <p id="${id}-hint" class="python-hint">${T.hint}</p>
    <div class="python-files"><button type="button" data-py="reset">${T.reset}</button><button type="button" data-py="undo" hidden>${T.undo}</button><button type="button" data-py="download">${T.download}</button><label class="python-file-label">${T.upload}<input type="file" data-py="upload" accept=".py,text/plain,text/x-python"></label></div>
    <p data-py="status" class="python-status" role="status">${T.ready}</p><p data-py="stale" class="python-stale" hidden>${T.stale}</p>
    <p data-py="source" class="python-source"></p>
    <div class="python-output-grid"><div><h4>${T.output}</h4><pre data-py="output" class="python-output" tabindex="0" aria-label="${T.output}">${T.none}</pre></div>
    <div><h4>${T.results}</h4><div data-py="results" class="python-results" role="region" tabindex="0" aria-label="${T.results}"></div></div></div>
    <details class="python-example"><summary>${T.sample}</summary><pre data-py="sample-code" tabindex="0" aria-label="${T.sample}"></pre><button type="button" data-py="sample">${T.sampleLoad}</button></details>
    <details class="python-reference"><summary>${T.reference}</summary><button type="button" data-py="reference">${T.refTest}</button><pre data-py="reference-code" tabindex="0" aria-label="${T.reference}"></pre></details>`;
  const $ = key => root.querySelector(`[data-py="${key}"]`);
  const editor = $('editor');
  editor.value = config.starter;
  try { const saved = localStorage.getItem(storageKey); if (saved !== null) editor.value = saved; } catch { /* optional storage */ }
  $('sample-code').textContent = config.sample;
  $('reference-code').textContent = config.reference;
  let worker = null, pending = null, timer = null, backup = null, lastSource = null;
  const setStatus = (text, state = '') => { $('status').textContent = text; root.dataset.state = state; };
  const save = () => {
    try { localStorage.setItem(storageKey, editor.value); $('save').textContent = T.saved; }
    catch { $('save').textContent = T.noSave; }
  };
  const markStale = () => { $('stale').hidden = lastSource === null || editor.value === lastSource; };
  const busy = value => {
    for (const key of ['run', 'test', 'reference']) $(key).disabled = value;
    $('stop').disabled = !value;
  };
  const log = text => {
    // Bound DOM work and retain the start of a traceback; runaway printing cannot freeze the page.
    const old = $('output').textContent;
    if (old.length < 60000) $('output').textContent = (old + text).slice(0, 60000);
  };
  function dispose() {
    clearTimeout(timer); timer = null;
    worker?.terminate(); worker = null; pending = null; busy(false);
  }
  function finish(result) {
    clearTimeout(timer); timer = null; busy(false);
    root.dataset.result = result.kind;
    if (result.kind === 'tests') {
      const rows = result.rows;
      const passed = rows.filter(r => r.status === 'pass').length;
      const incomplete = rows.filter(r => r.status === 'incomplete').length;
      const failed = rows.length - passed - incomplete;
      const state = failed ? 'fail' : incomplete ? 'incomplete' : rows.length ? 'pass' : 'fail';
      const heading = document.createElement('p'); heading.className = 'python-summary';
      heading.textContent = T.summary(passed, failed, incomplete, rows.length);
      const table = document.createElement('table');
      const head = table.createTHead().insertRow();
      for (const title of [T.columnStatus, T.case, T.detail]) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th); }
      const body = table.createTBody();
      for (const row of rows) {
        const tr = body.insertRow(); tr.dataset.status = row.status;
        const label = row.status === 'pass' ? T.pass : row.status === 'incomplete' ? T.incomplete : T.fail;
        for (const text of [label, row.name, row.detail || '']) { const td = tr.insertCell(); td.textContent = String(text).slice(0, 2000); }
      }
      $('results').replaceChildren(heading, table);
      setStatus(state === 'pass' ? T.allPass : state === 'incomplete' ? T.allTodo : T.failed, state);
    } else setStatus(T.ready, 'ready');
    if (!$('output').textContent) $('output').textContent = result.kind === 'tests' ? T.testsNoOutput : T.noOutput;
    pending = null; markStale();
  }
  function execute(mode, reference = false) {
    if (pending) return;
    save();
    const source = reference ? config.reference : editor.value;
    lastSource = reference ? null : source;
    $('stale').hidden = true;
    $('output').textContent = ''; $('results').replaceChildren();
    $('source').textContent = reference ? T.refLabel : T.source;
    root.dataset.result = '';
    const id = crypto.randomUUID(); pending = {id, source, mode}; busy(true); setStatus(T.loading, 'loading');
    timer = setTimeout(() => { dispose(); setStatus(T.loadTimeout, 'error'); log(T.loadTimeout); }, 90000);
    if (!worker) {
      worker = new Worker(new URL('./python-worker.js', import.meta.url), {type: 'module'});
      worker.addEventListener('message', ({data}) => {
        if (!pending || data.id !== pending.id) return;
        if (data.type === 'ready') {
          clearTimeout(timer);
          setStatus(data.mode === 'tests' ? T.testing : T.running, 'running');
          timer = setTimeout(() => { dispose(); setStatus(T.timeout, 'error'); log(`\n${T.timeout}`); }, 10000);
        } else if (data.type === 'stdout' || data.type === 'stderr') log(data.text + '\n');
        else if (data.type === 'result') finish(data.result);
        else if (data.type === 'error') {
          const text = data.error;
          const wasTest = pending.mode === 'tests';
          dispose(); log(text); setStatus(wasTest ? T.testsError : T.error, 'error'); markStale();
        }
      });
      worker.addEventListener('error', event => {
        event.preventDefault(); const text = event.message || 'Python worker failed to load';
        dispose(); log(text); setStatus(`${T.error}: ${text}`, 'error');
      });
    }
    worker.postMessage({id, mode, source});
  }
  editor.addEventListener('input', () => { save(); markStale(); });
  editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); execute('run'); }
  });
  $('run').onclick = () => execute('run'); $('test').onclick = () => execute('tests');
  $('reference').onclick = () => execute('tests', true);
  $('stop').onclick = () => { dispose(); setStatus(T.stopped, 'ready'); log(`\n${T.stopped}`); };
  function replaceCode(code) { backup = editor.value; editor.value = code; $('undo').hidden = false; save(); markStale(); }
  $('reset').onclick = () => replaceCode(config.starter);
  $('sample').onclick = () => { replaceCode(config.sample); editor.focus(); };
  $('undo').onclick = () => { const old = editor.value; editor.value = backup; backup = old; save(); markStale(); };
  $('upload').onchange = async event => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.py') || file.size > 200000) setStatus(T.importError, 'error');
      else replaceCode(await file.text());
    }
    event.target.value = '';
  };
  $('download').onclick = () => {
    const url = URL.createObjectURL(new Blob([editor.value], {type: 'text/x-python;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = config.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('pagehide', dispose, {once: true});
  root.dataset.ready = 'true';
}
