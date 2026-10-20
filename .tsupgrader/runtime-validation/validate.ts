/**
 * CLI entry point: `npx tsx .tsupgrader/runtime-validation/validate.ts`
 *
 * Exits with code 1 (and a readable list of problems) when the standalone
 * result artifact is malformed, so a corrupt or mistyped artifact fails the
 * pipeline instead of being silently accepted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StandaloneResultValidationError, parseStandaloneResult } from './schema';

const artifactPath = join(process.cwd(), '.tsupgrader/runtime-validation/standalone-result.json');

try {
  const artifact = parseStandaloneResult(readFileSync(artifactPath, 'utf8'));
  console.log(
    `✓ standalone result is valid (${artifact.result.assertions.length} assertions, ${artifact.retryCount} retries)`,
  );
} catch (error) {
  if (error instanceof StandaloneResultValidationError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
