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
 * Appends each unit test as an `assert` to the submitted code.
 * Parses stdout for PASS/FAIL/ERROR markers to count test results.
 */
export async function executePython(
  code: string,
  unitTests: string[]
): Promise<ExecuteResult> {
  // Append unit tests to the code
  const testCode = unitTests.map((t) => {
    const expr = t.replace(/^assert\s+/, '').trim();
    return `try:\n    assert ${expr}\n    print('PASS')\nexcept AssertionError as e:\n    print('FAIL: ' + str(e))\nexcept Exception as e:\n    print('ERROR: ' + str(e))`;
  }).join('\n\n');

  const fullCode = unitTests.length > 0
    ? `${code}\n\n# Unit tests\n${testCode}`
    : code;

  const apiKey = process.env.ONECOMPILER_API_KEY;

  if (!apiKey) {
    return {
      stdout: '', stderr: 'ONECOMPILER_API_KEY is not set in .env.local. Add your OneCompiler API key from onecompiler.com.', exitCode: -1,
      tests_passed: 0, tests_failed: 0, tests_errors: 0, tests_total: 0, all_passed: false, user_output: '',
    };
  }

  // Use direct OneCompiler API (key starts with 'oc_')
  // RapidAPI endpoint requires a different key format (long hex hash)
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
