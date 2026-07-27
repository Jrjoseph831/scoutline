import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tableName = process.env.TABLE_NAME;
const region = process.env.AWS_REGION || "us-east-1";
const items = JSON.parse(readFileSync(new URL("../data/scams.json", import.meta.url)));
if (!tableName) throw new Error("TABLE_NAME is required");

const av = (value) => {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(av) };
  if (typeof value === "object") return { M: Object.fromEntries(Object.entries(value).map(([key, next]) => [key, av(next)])) };
  return { S: String(value) };
};

for (let index = 0; index < items.length; index += 25) {
  const request = {
    [tableName]: items.slice(index, index + 25).map((item) => ({
      PutRequest: { Item: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, av(value)])) },
    })),
  };
  const result = spawnSync("aws", ["dynamodb", "batch-write-item", "--region", region, "--request-items", JSON.stringify(request)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Seeded ${items.length} verified scam records.`);
