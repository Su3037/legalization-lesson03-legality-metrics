# Vendored browser Python runtime

Pyodide **314.0.8**, containing CPython **3.14.2**, is served from this site's
own `python-lab/vendor/` directory. There are no runtime CDN dependencies.
The interpreter is loaded only after the learner requests execution.

Source archive:
https://github.com/pyodide/pyodide/releases/download/314.0.8/pyodide-core-314.0.8.tar.bz2

`manifest.json` records the archive SHA256 and each unmodified upstream file's
SHA256 and size. Only the loader, JavaScript/WASM runtime, standard library,
package metadata and lockfile are included (about 13 MB in total).

- Pyodide: MPL-2.0, see `LICENSE-PYODIDE.txt` and https://github.com/pyodide/pyodide.
- CPython and its standard library: PSF license and retained notices in
  `LICENSE-CPYTHON.txt`, from https://github.com/python/cpython/tree/v3.14.2.

These upstream licenses are separate from the lesson's MIT/CC BY licenses.
The vendored upstream files have not been modified. The module worker and
editor one directory above are lesson code.
