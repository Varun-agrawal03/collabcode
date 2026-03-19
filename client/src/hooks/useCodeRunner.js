/**
 * useCodeRunner.js
 *
 * Handles ALL code execution CLIENT-SIDE so no server Python install is needed:
 *
 *   JavaScript  → runs in a sandboxed Web Worker (no DOM access, safe)
 *   TypeScript  → strips types → runs same as JS worker
 *   Python      → Pyodide (CPython compiled to WASM, loads once, cached)
 *   HTML        → iframe srcDoc preview (no execution needed)
 *
 * The server `run-code` socket event is used only as a relay/trigger.
 * Results are emitted back via socket so ALL room members see the same output.
 * (This lets the room agree on "last run result" without server-side execution.)
 *
 * For offline/simple use: direct local execution without the server relay.
 */

import { useState, useRef, useCallback } from "react";

// ─── JavaScript Worker code (inlined as blob URL) ────────────────────────────
const JS_WORKER_SRC = `
self.onmessage = function(e) {
  const { code, fileId } = e.data;
  const logs = [];
  const errors = [];
  const start = Date.now();

  // Override console inside worker
  const fakeConsole = {
    log:   (...a) => logs.push(a.map(s).join(' ')),
    error: (...a) => errors.push('[error] ' + a.map(s).join(' ')),
    warn:  (...a) => logs.push('[warn] ' + a.map(s).join(' ')),
    info:  (...a) => logs.push('[info] ' + a.map(s).join(' ')),
    table: (...a) => logs.push('[table] ' + JSON.stringify(a[0], null, 2)),
  };

  function s(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'object') { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
    return String(v);
  }

  // Replace global console
  const origConsole = console;
  try {
    // Create a scoped eval with fake console
    const fn = new Function('console', 'setTimeout', 'setInterval', 'fetch', code);
    fn(fakeConsole, () => {}, () => {}, undefined);
    self.postMessage({
      fileId, success: true,
      output: logs.join('\\n'),
      errors: errors.join('\\n'),
      elapsed: Date.now() - start,
    });
  } catch(err) {
    self.postMessage({
      fileId, success: false,
      output: logs.join('\\n'),
      errors: err.message + (err.stack ? '\\n' + err.stack.split('\\n').slice(1,3).join('\\n') : ''),
      elapsed: Date.now() - start,
    });
  }
};
`;

function makeWorkerURL(src) {
  const blob = new Blob([src], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

// ─── TypeScript → JavaScript (best-effort strip) ─────────────────────────────
function stripTypeScript(code) {
  return code
    // Remove interface declarations
    .replace(/^(export\s+)?interface\s+\w+[\s\S]*?\n\}/gm, "")
    // Remove type aliases
    .replace(/^(export\s+)?type\s+\w+\s*=[\s\S]*?;/gm, "")
    // Remove generic type params from function signatures <T, U>
    .replace(/<[A-Z][A-Za-z0-9,\s]*>/g, "")
    // Remove return type annotations ): TypeName {
    .replace(/\)\s*:\s*[\w<>\[\]|&,\s]+\s*(\{)/g, ") $1")
    // Remove parameter type annotations (param: Type)
    .replace(/(\w+)\s*\?\s*:\s*[\w<>\[\]|&,\s]+/g, "$1")
    .replace(/(\w+)\s*:\s*[\w<>\[\]|&,\s]+(\s*[,)=;])/g, "$1$2")
    // Remove access modifiers
    .replace(/\b(public|private|protected|readonly|abstract|override)\s+/g, "")
    // Remove 'as' casts
    .replace(/\s+as\s+[\w<>\[\]]+/g, "")
    // Remove non-null assertions
    .replace(/!(\.|;|\[|\))/g, "$1")
    // Remove 'export' keywords (not needed in sandbox)
    .replace(/^export\s+/gm, "");
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useCodeRunner() {
  const [results, setResults]   = useState({}); // fileId → result
  const [running, setRunning]   = useState({}); // fileId → bool
  const pyodideRef = useRef(null);              // cached Pyodide instance
  const pyodideLoadingRef = useRef(false);
  const workerURLRef = useRef(null);

  // ── Run JavaScript / TypeScript ─────────────────────────────────────────────
  const runJS = useCallback((fileId, code, isTS = false) => {
    return new Promise((resolve) => {
      const src = isTS ? stripTypeScript(code) : code;

      // Lazy-create the worker URL once
      if (!workerURLRef.current) {
        workerURLRef.current = makeWorkerURL(JS_WORKER_SRC);
      }

      // Each run gets a fresh worker (ensures clean globals, enforces timeout)
      const worker = new Worker(workerURLRef.current);
      const timeout = setTimeout(() => {
        worker.terminate();
        resolve({ fileId, success: false, output: "", errors: "Execution timed out (5s limit)", elapsed: 5000 });
      }, 5000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(e.data);
      };

      worker.onerror = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve({ fileId, success: false, output: "", errors: e.message || "Worker error", elapsed: 0 });
      };

      worker.postMessage({ code: src, fileId });
    });
  }, []);

  // ── Run Python via Pyodide ──────────────────────────────────────────────────
  const runPython = useCallback(async (fileId, code) => {
    const start = Date.now();

    // Load Pyodide on first use (cached after that)
    if (!pyodideRef.current) {
      if (pyodideLoadingRef.current) {
        // Wait for it to load
        await new Promise(res => {
          const interval = setInterval(() => {
            if (pyodideRef.current) { clearInterval(interval); res(); }
          }, 100);
        });
      } else {
        pyodideLoadingRef.current = true;
        try {
          // Dynamically load the Pyodide script from CDN
          if (!window.loadPyodide) {
            await new Promise((res, rej) => {
              const script = document.createElement("script");
              script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js";
              script.onload = res;
              script.onerror = rej;
              document.head.appendChild(script);
            });
          }
          pyodideRef.current = await window.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
          });
        } catch (err) {
          return {
            fileId, success: false, output: "",
            errors: "Failed to load Python runtime (Pyodide).\nCheck your internet connection.\n" + err.message,
            elapsed: Date.now() - start,
          };
        }
      }
    }

    const pyodide = pyodideRef.current;

    try {
      // Redirect stdout/stderr
      pyodide.runPython(`
import sys, io
_stdout = io.StringIO()
_stderr = io.StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
      `);

      let success = true;
      let errMsg  = "";

      try {
        pyodide.runPython(code);
      } catch (err) {
        success = false;
        errMsg  = err.message;
      }

      const output = pyodide.runPython("_stdout.getvalue()");
      const stderr = pyodide.runPython("_stderr.getvalue()");

      // Restore
      pyodide.runPython("sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__");

      return {
        fileId, success,
        output: output || "",
        errors: (stderr || "") + (errMsg ? (stderr ? "\n" : "") + errMsg : ""),
        elapsed: Date.now() - start,
        runtime: "Pyodide",
      };
    } catch (err) {
      return { fileId, success: false, output: "", errors: err.message, elapsed: Date.now() - start };
    }
  }, []);

  // ── Main run dispatcher ─────────────────────────────────────────────────────
  const run = useCallback(async (fileId, language, code) => {
    setRunning(prev => ({ ...prev, [fileId]: true }));

    let result;
    switch (language) {
      case "javascript":
        result = await runJS(fileId, code, false);
        break;
      case "typescript":
        result = await runJS(fileId, code, true);
        break;
      case "python":
        result = await runPython(fileId, code);
        break;
      case "html":
        // HTML preview is handled directly in OutputPanel via iframe
        result = { fileId, success: true, output: "__HTML_PREVIEW__", errors: "", elapsed: 0 };
        break;
      default:
        result = {
          fileId, success: false, output: "",
          errors: `Cannot run "${language}" in the browser.\n\nSupported: JavaScript, TypeScript, Python, HTML`,
          elapsed: 0,
        };
    }

    setResults(prev => ({ ...prev, [fileId]: result }));
    setRunning(prev => ({ ...prev, [fileId]: false }));
    return result;
  }, [runJS, runPython]);

  const isPyodideReady = !!pyodideRef.current;

  return { run, results, running, isPyodideReady };
}
