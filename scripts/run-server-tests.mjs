import { spawnSync } from "node:child_process";

const testArgs = ["-m", "unittest", "discover", "-s", "server/tests", "-p", "test_*.py"];

const candidates = process.env.PYTHON ? [process.env.PYTHON] : ["python3", "python"];

for (const executable of candidates) {
  const result = spawnSync(executable, testArgs, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}

console.error(`Unable to find Python. Tried ${candidates.join(", ")}. Set PYTHON to a Python 3 executable.`);
process.exit(1);
