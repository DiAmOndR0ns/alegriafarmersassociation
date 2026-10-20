import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  StandaloneResultValidationError,
  parseStandaloneResult,
  validateStandaloneResult,
} from './schema';

const artifactPath = join(process.cwd(), '.tsupgrader/runtime-validation/standalone-result.json');

const validArtifact = () => ({
  planHash: 'abc123',
  phase: 'standalone',
  recordedAtUtc: '2026-10-20T05:10:31.9568674Z',
  retryCount: 1,
  attemptHistory: [
    {
      attempt: 1,
      phase: 'standalone',
      startedAtUtc: null,
      completedAtUtc: null,
      setupSucceeded: true,
      failedAssertion: null,
      failureCategory: null,
      outputSample: null,
    },
  ],
  resetBaseline: false,
  complete: true,
  result: {
    setupSucceeded: true,
    setupDurationMs: 1000,
    setupFailureOutput: null,
    assertions: [
      {
        name: 'tsc-no-emit',
        kind: 'process',
        verificationMethod: 'exit-code',
        passed: true,
        timedOut: false,
        skipped: false,
        skippedReason: null,
        exitCode: 0,
        outputSample: '',
        durationMs: 100,
      },
    ],
    executions: [
      {
        source: 'tsc-no-emit',
        resolvedExecutable: 'npm',
        args: ['run', 'lint'],
        cwd: '.',
        env: {},
        prependPath: [],
        platform: 'win32',
      },
    ],
  },
});

describe('validateStandaloneResult', () => {
  it('accepts a well-formed artifact', () => {
    expect(() => validateStandaloneResult(validArtifact())).not.toThrow();
  });

  it('rejects an unknown assertion kind', () => {
    const artifact = validArtifact();
    (artifact.result.assertions[0] as { kind: string }).kind = 'http_probe';

    expect(() => validateStandaloneResult(artifact)).toThrow(StandaloneResultValidationError);
    try {
      validateStandaloneResult(artifact);
    } catch (error) {
      expect((error as StandaloneResultValidationError).issues[0].path).toBe('result.assertions[0].kind');
    }
  });

  it('rejects an unknown verification method', () => {
    const artifact = validArtifact();
    (artifact.result.assertions[0] as { verificationMethod: string }).verificationMethod = 'exit_code';

    try {
      validateStandaloneResult(artifact);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(StandaloneResultValidationError);
      expect((error as StandaloneResultValidationError).issues[0].path).toBe(
        'result.assertions[0].verificationMethod',
      );
    }
  });

  it('rejects an attempt history that disagrees with retryCount', () => {
    const artifact = validArtifact();
    artifact.retryCount = 3;

    try {
      validateStandaloneResult(artifact);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect((error as StandaloneResultValidationError).issues[0].path).toBe('attemptHistory');
    }
  });

  it('reports invalid JSON instead of throwing a raw SyntaxError', () => {
    expect(() => parseStandaloneResult('-{}')).toThrow(StandaloneResultValidationError);
  });
});

describe('recorded standalone artifact', () => {
  it('on disk conforms to the schema', () => {
    const parsed = parseStandaloneResult(readFileSync(artifactPath, 'utf8'));

    expect(parsed.attemptHistory).toHaveLength(parsed.retryCount);
    expect(parsed.result.assertions.length).toBeGreaterThan(0);
  });
});
