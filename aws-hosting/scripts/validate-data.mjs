import fs from "node:fs";

const items = JSON.parse(fs.readFileSync(new URL("../data/scams.json", import.meta.url), "utf8"));
const requiredText = ["slug", "title", "summary", "category", "impersonates", "responseScript", "sourcePublisher", "sourceUrl", "sourcePublishedAt", "lastVerifiedAt"];
const requiredLists = ["channels", "warningSigns", "actionSteps"];
const failures = [];
const seenSlugs = new Set();
const seenTitles = new Set();

for (const [index, item] of items.entries()) {
  const label = item.slug || `record-${index + 1}`;
  for (const field of requiredText) {
    if (typeof item[field] !== "string" || !item[field].trim()) failures.push(`${label}: missing ${field}`);
  }
  for (const field of requiredLists) {
    if (!Array.isArray(item[field]) || item[field].length < 1) failures.push(`${label}: missing ${field}`);
  }
  if (seenSlugs.has(item.slug)) failures.push(`${label}: duplicate slug`);
  if (seenTitles.has(item.title.toLowerCase())) failures.push(`${label}: duplicate title`);
  seenSlugs.add(item.slug);
  seenTitles.add(item.title.toLowerCase());
  try {
    const source = new URL(item.sourceUrl);
    if (source.protocol !== "https:") failures.push(`${label}: sourceUrl must use HTTPS`);
  } catch {
    failures.push(`${label}: invalid sourceUrl`);
  }
  if (/\b(placeholder|lorem ipsum|example\.com)\b/i.test(JSON.stringify(item))) failures.push(`${label}: placeholder content`);
}

if (items.length < 50) failures.push(`catalog regression: expected at least 50 guides, found ${items.length}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Validated ${items.length} source-backed scam guides.`);
