import { runDoctor } from "./doctor.js";
import { runApply } from "./apply.js";
import { runGuide } from "./guide.js";
import { runReport } from "./report-command.js";
import { runSchema } from "./schema-command.js";
import { runVerify } from "./verify.js";

function printHelp() {
  console.log(`openclaw-feishu-fix

Usage:
  openclaw-feishu-fix doctor [--json]
  openclaw-feishu-fix report [--json]
  openclaw-feishu-fix guide [--json]
  openclaw-feishu-fix schema
  openclaw-feishu-fix apply [--json]
  openclaw-feishu-fix verify [--json]

Commands:
  doctor   Human-readable diagnosis summary
  report   Structured JSON diagnosis for agents and automation
  guide    Human-readable remediation guidance derived from the diagnosis
  schema   Print the JSON schema path and contents for report consumers
  apply    Optional expert mode: patch current machine directly
  verify   Re-check current machine after manual or scripted fixes
`);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const flags = new Set(rest);
  return {
    command,
    json: flags.has("--json")
  };
}

export async function main(argv) {
  const { command, json } = parseArgs(argv);
  try {
    switch (command) {
      case "doctor": {
        const result = await runDoctor({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "report": {
        const result = await runReport({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "guide": {
        const result = await runGuide({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "schema": {
        const result = await runSchema({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "apply": {
        const result = await runApply({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        return;
      }
      case "verify": {
        const result = await runVerify({ json });
        if (json) console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
