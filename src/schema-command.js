import fs from "node:fs";
import path from "node:path";

const schemaPath = path.resolve(process.cwd(), "schemas", "report.schema.json");

export async function runSchema({ json = false } = {}) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const result = {
    schemaPath,
    schema
  };
  if (!json) {
    console.log(schemaPath);
    console.log(JSON.stringify(schema, null, 2));
  }
  return result;
}
