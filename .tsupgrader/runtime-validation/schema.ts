/**
 * Runtime schema for the standalone validation artifact
 * (.tsupgrader/runtime-validation/standalone-result.json).
 *
 * The artifact is produced by the upgrade runner and consumed by tooling that
 * decides whether an upgrade may proceed. Values such as `kind` and
 * `verificationMethod` used to be free-form strings, so a typo ("http_probe",
 * "exit_code") would deserialize silently and bypass assertion evaluation.
 * These union types plus `validateStandaloneResult` make those mistakes fail
 * loudly instead.
 */

export const ASSERTION_KINDS = ['process', 'http-probe'] as const;
export type AssertionKind = (typeof ASSERTION_KINDS)[number];

export const VERIFICATION_METHODS = ['exit-code', 'http-status', 'test-results'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface AssertionResult {
  name: string;
  kind: AssertionKind;
  verificationMethod: VerificationMethod;
  passed: boolean;
  timedOut: boolean;
  skipped: boolean;
  skippedReason: string | null;
  exitCode: number | null;
  outputSample: string | null;
  durationMs: number;
  testResults?: {
    testFramework: string;
    runnerDetectedFrom: string;
    testsTotal: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    parseFailed: boolean;
  };
}

export interface ExecutionSpec {
  source: string;
  resolvedExecutable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  prependPath: string[];
  platform: string;
}

export interface AttemptRecord {
  attempt: number;
  phase: string;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  setupSucceeded: boolean | null;
  failedAssertion: string | null;
  failureCategory: string | null;
  outputSample: string | null;
  note?: string;
}

export interface StandaloneResult {
  planHash: string;
  phase: string;
  recordedAtUtc: string;
  retryCount: number;
  attemptHistory: AttemptRecord[];
  resetBaseline: boolean;
  complete: boolean;
  result: {
    setupSucceeded: boolean;
    setupDurationMs: number;
    setupFailureOutput: string | null;
    assertions: AssertionResult[];
    executions: ExecutionSpec[];
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class StandaloneResultValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `Invalid standalone result artifact:\n${issues
        .map((issue) => `  - ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'StandaloneResultValidationError';
    this.issues = issues;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Validates an already-parsed artifact. Returns the list of problems found;
 * an empty array means the artifact is valid.
 */
export function collectStandaloneResultIssues(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ path: '$', message: 'artifact must be a JSON object' }];
  }

  for (const key of ['planHash', 'phase', 'recordedAtUtc'] as const) {
    if (typeof value[key] !== 'string' || (value[key] as string).trim() === '') {
      issues.push({ path: key, message: 'expected a non-empty string' });
    }
  }

  if (typeof value.retryCount !== 'number' || !Number.isInteger(value.retryCount) || value.retryCount < 0) {
    issues.push({ path: 'retryCount', message: 'expected a non-negative integer' });
  }

  for (const key of ['resetBaseline', 'complete'] as const) {
    if (typeof value[key] !== 'boolean') {
      issues.push({ path: key, message: 'expected a boolean' });
    }
  }

  if (!Array.isArray(value.attemptHistory)) {
    issues.push({ path: 'attemptHistory', message: 'expected an array of attempt records' });
  } else if (typeof value.retryCount === 'number' && value.attemptHistory.length !== value.retryCount) {
    issues.push({
      path: 'attemptHistory',
      message: `expected ${value.retryCount} entries to match retryCount, found ${value.attemptHistory.length}`,
    });
  }

  const result = value.result;
  if (!isRecord(result)) {
    issues.push({ path: 'result', message: 'expected an object' });
    return issues;
  }

  if (typeof result.setupSucceeded !== 'boolean') {
    issues.push({ path: 'result.setupSucceeded', message: 'expected a boolean' });
  }
  if (typeof result.setupDurationMs !== 'number') {
    issues.push({ path: 'result.setupDurationMs', message: 'expected a number' });
  }

  if (!Array.isArray(result.assertions)) {
    issues.push({ path: 'result.assertions', message: 'expected an array' });
  } else {
    result.assertions.forEach((assertion, index) => {
      const path = `result.assertions[${index}]`;
      if (!isRecord(assertion)) {
        issues.push({ path, message: 'expected an object' });
        return;
      }
      if (typeof assertion.name !== 'string' || assertion.name.trim() === '') {
        issues.push({ path: `${path}.name`, message: 'expected a non-empty string' });
      }
      if (!ASSERTION_KINDS.includes(assertion.kind as AssertionKind)) {
        issues.push({
          path: `${path}.kind`,
          message: `expected one of ${ASSERTION_KINDS.join(', ')}, received ${JSON.stringify(assertion.kind)}`,
        });
      }
      if (!VERIFICATION_METHODS.includes(assertion.verificationMethod as VerificationMethod)) {
        issues.push({
          path: `${path}.verificationMethod`,
          message: `expected one of ${VERIFICATION_METHODS.join(', ')}, received ${JSON.stringify(
            assertion.verificationMethod,
          )}`,
        });
      }
      for (const key of ['passed', 'timedOut', 'skipped'] as const) {
        if (typeof assertion[key] !== 'boolean') {
          issues.push({ path: `${path}.${key}`, message: 'expected a boolean' });
        }
      }
      if (typeof assertion.durationMs !== 'number') {
        issues.push({ path: `${path}.durationMs`, message: 'expected a number' });
      }
    });
  }

  if (!Array.isArray(result.executions)) {
    issues.push({ path: 'result.executions', message: 'expected an array' });
  } else {
    result.executions.forEach((execution, index) => {
      const path = `result.executions[${index}]`;
      if (!isRecord(execution)) {
        issues.push({ path, message: 'expected an object' });
        return;
      }
      if (typeof execution.source !== 'string') {
        issues.push({ path: `${path}.source`, message: 'expected a string' });
      }
      if (!isStringArray(execution.args)) {
        issues.push({ path: `${path}.args`, message: 'expected an array of strings' });
      }
      if (!isStringArray(execution.prependPath)) {
        issues.push({ path: `${path}.prependPath`, message: 'expected an array of strings' });
      }
    });
  }

  return issues;
}

/**
 * Validates the parsed artifact and returns it typed as `StandaloneResult`.
 * Throws `StandaloneResultValidationError` when anything is out of shape.
 */
export function validateStandaloneResult(value: unknown): StandaloneResult {
  const issues = collectStandaloneResultIssues(value);
  if (issues.length > 0) {
    throw new StandaloneResultValidationError(issues);
  }
  return value as StandaloneResult;
}

/** Parses JSON text and validates it in one step. */
export function parseStandaloneResult(json: string): StandaloneResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new StandaloneResultValidationError([
      { path: '$', message: `artifact is not valid JSON: ${(error as Error).message}` },
    ]);
  }
  return validateStandaloneResult(parsed);
}
