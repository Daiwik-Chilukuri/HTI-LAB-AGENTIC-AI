export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  tests_passed: number;
  tests_failed: number;
  tests_errors: number;
  tests_total: number;
  all_passed: boolean;
  user_output: string;
}

/**
 * Execute Python code + unit tests via the OneCompiler API.
 * Parses stdout for PASS/FAIL/ERROR markers to count test results.
 *
 * Handles three test patterns:
 * 1. Assignment:  `X, Y = fn()`    → exec + assert each var is not None
 * 2. Expression:    `fn() == value`  → assert fn() == value
 * 3. Void call:     `fn()`          → exec + ignore return
 *
 * Multi-line test strings (containing \n) are prepended as setup code,
 * NOT treated as individual test cases.
 */
export async function executePython(
  code: string,
  unitTests: string[]
): Promise<ExecuteResult> {
  // Separate multi-line setup snippets from single-line test cases.
  // Multi-line strings → setup code (before user code). Single-line strings → test cases.
  const setupLines: string[] = [];
  const singleLineTests: string[] = [];
  for (const t of unitTests) {
    const trimmed = t.trim();
    if (trimmed.includes('\n')) {
      setupLines.push(trimmed);
    } else if (trimmed) {
      singleLineTests.push(trimmed);
    }
  }

  // Transform single-line tests into runnable Python blocks
  const testBlocks = singleLineTests.map((t) => {
    const raw = t.replace(/^assert\s+/, '').trim();

    // Pattern: "a, b, c = call()"  (multi-assignment)
    const assignMatch = raw.match(/^(\w+(?:\s*,\s*\w+)*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const vars = assignMatch[1].split(/\s*,\s*/);
      return [
        raw,
        ...vars.map((v) => `try:\n    assert ${v} is not None\n    print('PASS')\nexcept AssertionError:\n    print('FAIL')\nexcept Exception as e:\n    print('ERROR: ' + str(e))`),
      ];
    }

    // Bare call — no comparison operators
    const isBareCall = !raw.includes('==') && !raw.includes('!=') &&
      !raw.includes('<') && !raw.includes('>') &&
      !raw.includes('<=') && !raw.includes('>=');

    if (isBareCall) {
      return [
        `try:\n    ${raw}\n    print('PASS')\nexcept AssertionError:\n    print('FAIL')\nexcept Exception as e:\n    print('ERROR: ' + str(e))`,
      ];
    }

    // Expression assert
    return [
      `try:\n    assert ${raw}\n    print('PASS')\nexcept AssertionError as e:\n    print('FAIL: ' + str(e))\nexcept Exception as e:\n    print('ERROR: ' + str(e))`,
    ];
  });

  const setupCode = setupLines.join('\n');
  const testCode = testBlocks.flat().join('\n\n');

  // Build final code: setup lines first, then user code, then test wrappers
  let fullCode: string;
  if (testCode) {
    fullCode = setupCode ? `${setupCode}\n\n${code}\n\n# Unit tests\n${testCode}` : `${code}\n\n# Unit tests\n${testCode}`;
  } else {
    fullCode = setupCode ? `${setupCode}\n\n${code}` : code;
  }

  const apiKey = process.env.ONECOMPILER_API_KEY;

  if (!apiKey) {
    return {
      stdout: '', stderr: 'ONECOMPILER_API_KEY is not set in .env.local. Add your OneCompiler API key from onecompiler.com.', exitCode: -1,
      tests_passed: 0, tests_failed: 0, tests_errors: 0, tests_total: 0, all_passed: false, user_output: '',
    };
  }

  const response = await fetch('https://api.onecompiler.com/v1/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      language: 'python',
      files: [{ name: 'main.py', content: fullCode }],
      stdin: '',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      stdout: '', stderr: `OneCompiler API error ${response.status}: ${text}`, exitCode: -1,
      tests_passed: 0, tests_failed: 0, tests_errors: 0, tests_total: 0, all_passed: false, user_output: '',
    };
  }

  const data = await response.json() as {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    output?: string;
  };

  const stdout = (data.stdout ?? '').trim();
  const stderr = (data.stderr ?? '').trim();

  const lines = stdout.split('\n').filter(Boolean);
  const passed = lines.filter((l) => l.startsWith('PASS')).length;
  const failed = lines.filter((l) => l.startsWith('FAIL')).length;
  const errors  = lines.filter((l) => l.startsWith('ERROR')).length;
  const total   = passed + failed + errors;

  return {
    stdout,
    stderr,
    exitCode: data.exitCode ?? 0,
    tests_passed: passed,
    tests_failed: failed,
    tests_errors: errors,
    tests_total: total,
    all_passed: total > 0 && failed === 0 && errors === 0,
    user_output: stdout,
  };
}
