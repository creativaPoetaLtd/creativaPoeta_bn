const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const testDirectory = join(__dirname, "..", "dist", "tests");
const tests = readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => join(testDirectory, name));

if (!tests.length) {
  console.error("No compiled backend tests were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
