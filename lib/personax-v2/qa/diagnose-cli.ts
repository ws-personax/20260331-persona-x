import fs from 'fs';
import path from 'path';

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env.local'));

// Usage: npx tsx lib/personax-v2/qa/diagnose-cli.ts
async function main(): Promise<void> {
  const { diagnoseNonInvestQuestions, formatDiagnosticReport } = await import('./diagnose');
  const results = await diagnoseNonInvestQuestions();
  console.log(formatDiagnosticReport(results));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
