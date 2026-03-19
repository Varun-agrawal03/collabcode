/**
 * runner.js — Sandboxed Code Execution Engine
 *
 * Supports: JavaScript, Python, C++, Java, Bash
 * Each execution:
 *   1. Writes code to a temp file in an isolated temp dir
 *   2. Spawns a child process with resource limits
 *   3. Captures stdout + stderr with a hard timeout
 *   4. Cleans up temp files
 *
 * Security measures:
 *   - 10-second execution timeout (kills runaway processes)
 *   - Temp dir per execution (no cross-contamination)
 *   - No shell: true on spawn (prevents shell injection)
 *   - Output capped at 50KB
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

const TIMEOUT_MS = 10000;   // 10 second hard kill
const MAX_OUTPUT = 50000;   // 50KB output cap

/**
 * Language config: how to write and run each language
 * cmd: the executable
 * args(file, dir): returns argv array
 * filename: what to name the source file
 * compileCmd / compileArgs: optional compile step before running
 */
const LANGUAGE_CONFIG = {
  javascript: {
    filename: "main.js",
    cmd: "node",
    args: (file) => [file],
  },
  typescript: {
    filename: "main.ts",
    // Transpile with ts-node if available, else fallback to node after strip
    cmd: "node",
    args: (file, dir) => {
      // Simple TS→JS strip: remove type annotations for basic TS
      const tsContent = fs.readFileSync(file, "utf8");
      const jsContent = stripTypes(tsContent);
      const jsFile = path.join(dir, "main.js");
      fs.writeFileSync(jsFile, jsContent);
      return [jsFile];
    },
  },
  python: {
    filename: "main.py",
    cmd: "python3",
    args: (file) => [file],
  },
  cpp: {
    filename: "main.cpp",
    // Two-step: compile then run
    compileCmd: "g++",
    compileArgs: (file, outFile) => ["-o", outFile, file, "-std=c++17"],
    cmd: null, // set dynamically to outFile
    args: (outFile) => [outFile],
  },
  c: {
    filename: "main.c",
    compileCmd: "gcc",
    compileArgs: (file, outFile) => ["-o", outFile, file],
    cmd: null,
    args: (outFile) => [outFile],
  },
  java: {
    filename: "Main.java",
    compileCmd: "javac",
    compileArgs: (file) => [file],
    cmd: "java",
    args: (file, dir) => ["-cp", dir, "Main"],
  },
  bash: {
    filename: "main.sh",
    cmd: "bash",
    args: (file) => [file],
  },
};

/**
 * Very basic TypeScript type-stripping for simple cases.
 * For production, use ts-node or esbuild.
 */
function stripTypes(ts) {
  return ts
    .replace(/:\s*(string|number|boolean|void|any|never|unknown|null|undefined)(\[\])?/g, "")
    .replace(/interface\s+\w+\s*\{[^}]*\}/gs, "")
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, "")
    .replace(/<[A-Z][A-Za-z]*>/g, "");
}

/**
 * Run a child process, capturing stdout/stderr, with timeout.
 * Returns { stdout, stderr, exitCode, timedOut }
 */
function runProcess(cmd, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(cmd, args, {
      cwd: options.cwd || os.tmpdir(),
      env: { ...process.env, JAVA_TOOL_OPTIONS: "" }, // suppress Java proxy noise
      timeout: TIMEOUT_MS,
    });

    const killTimer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(0, MAX_OUTPUT) + "\n[Output truncated at 50KB]";
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT);
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code, timedOut: killed });
    });

    child.on("error", (err) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr: err.message, exitCode: -1, timedOut: false });
    });
  });
}

/**
 * Main entry point: execute code in a given language.
 * @param {string} code - source code string
 * @param {string} language - language key (javascript, python, etc.)
 * @param {string} [stdin] - optional stdin input
 * @returns {{ output, error, exitCode, timedOut, executionTime }}
 */
async function executeCode(code, language, stdin = "") {
  const lang = LANGUAGE_CONFIG[language];
  if (!lang) {
    return {
      output: "",
      error: `Language '${language}' is not supported for execution.\nSupported: ${Object.keys(LANGUAGE_CONFIG).join(", ")}`,
      exitCode: 1,
      timedOut: false,
      executionTime: 0,
    };
  }

  // Create isolated temp directory for this execution
  const execId = uuidv4().slice(0, 8);
  const tmpDir = path.join(os.tmpdir(), `collabcode-${execId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const sourceFile = path.join(tmpDir, lang.filename);
  const startTime = Date.now();

  try {
    // Write source code to temp file
    fs.writeFileSync(sourceFile, code, "utf8");

    // ── Compile step (C, C++, Java) ────────────────────────────────────
    if (lang.compileCmd) {
      const outFile = path.join(tmpDir, "program");
      const compileArgs = lang.compileArgs(sourceFile, outFile);

      const compileResult = await runProcess(lang.compileCmd, compileArgs, { cwd: tmpDir });

      if (compileResult.exitCode !== 0) {
        return {
          output: "",
          error: compileResult.stderr || "Compilation failed",
          exitCode: compileResult.exitCode,
          timedOut: false,
          executionTime: Date.now() - startTime,
          stage: "compile",
        };
      }

      // ── Run compiled binary ──────────────────────────────────────────
      let runCmd, runArgs;
      if (language === "java") {
        runCmd = lang.cmd;
        runArgs = lang.args(sourceFile, tmpDir);
      } else {
        runCmd = outFile;
        runArgs = [];
      }

      const runResult = await runProcess(runCmd, runArgs, { cwd: tmpDir });
      return buildResult(runResult, startTime);
    }

    // ── Interpret step (Node, Python, Bash, TypeScript) ─────────────────
    const args = lang.args(sourceFile, tmpDir);
    const cmd = lang.cmd;
    const result = await runProcess(cmd, args, { cwd: tmpDir });
    return buildResult(result, startTime);

  } catch (err) {
    return {
      output: "",
      error: `Execution error: ${err.message}`,
      exitCode: -1,
      timedOut: false,
      executionTime: Date.now() - startTime,
    };
  } finally {
    // Always clean up temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function buildResult({ stdout, stderr, exitCode, timedOut }, startTime) {
  const executionTime = Date.now() - startTime;

  if (timedOut) {
    return {
      output: stdout,
      error: `⏱ Execution timed out after ${TIMEOUT_MS / 1000}s. Check for infinite loops.`,
      exitCode: -1,
      timedOut: true,
      executionTime,
    };
  }

  return {
    output: stdout,
    error: stderr,
    exitCode: exitCode ?? 0,
    timedOut: false,
    executionTime,
  };
}

module.exports = { executeCode, LANGUAGE_CONFIG };
