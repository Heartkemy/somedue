import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const nativeRoot = path.join(root, "src-tauri");
const output = path.join(root, "out", "THIRD_PARTY_NOTICES.md");
const noticePattern = /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i;

function runCargo(args) {
  return execFileSync("cargo", args, { cwd: nativeRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function readNoticeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && noticePattern.test(entry.name))
    .map(entry => ({
      name: entry.name,
      text: readFileSync(path.join(directory, entry.name), "utf8").trim(),
    }))
    .filter(file => file.text.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function component(name, version, license, directory, origin) {
  const notices = readNoticeFiles(directory);
  return { name, version, license: license || "UNDECLARED", notices, origin };
}

const packageManifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const frontend = Object.keys(packageManifest.dependencies || {})
  .sort()
  .map(name => {
    const directory = path.join(root, "node_modules", name);
    const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    return component(name, manifest.version, manifest.license, directory, "frontend");
  });

const metadata = JSON.parse(runCargo(["metadata", "--locked", "--offline", "--format-version", "1"]));
const packageById = new Map(metadata.packages.map(pkg => [`${pkg.name}@${pkg.version}`, pkg]));
const nativeKeys = new Set();
for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
  const tree = runCargo([
    "tree",
    "--locked",
    "--offline",
    "--target",
    target,
    "--edges",
    "normal",
    "--prefix",
    "none",
    "-p",
    "somedue",
  ]);
  for (const line of tree.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+) v([^\s]+)/);
    if (match && match[1] !== "somedue") nativeKeys.add(`${match[1]}@${match[2]}`);
  }
}

const native = [...nativeKeys]
  .sort()
  .map(key => {
    const pkg = packageById.get(key);
    if (!pkg) throw new Error(`Cargo metadata is missing ${key}.`);
    return component(pkg.name, pkg.version, pkg.license, path.dirname(pkg.manifest_path), "native");
  });

const components = [...frontend, ...native].sort((left, right) =>
  `${left.origin}:${left.name}:${left.version}`.localeCompare(`${right.origin}:${right.name}:${right.version}`),
);
const undeclared = components.filter(item => item.license === "UNDECLARED");
if (undeclared.length) {
  throw new Error(`Missing license declarations: ${undeclared.map(item => `${item.name}@${item.version}`).join(", ")}`);
}
const missingNoticeFiles = components.filter(item => !item.notices.length);
const groupedNotices = new Map();
for (const item of components) {
  for (const notice of item.notices) {
    const hash = createHash("sha256").update(notice.text).digest("hex");
    const group = groupedNotices.get(hash) || { text: notice.text, names: new Set(), files: new Set() };
    group.names.add(`${item.name}@${item.version}`);
    group.files.add(notice.name);
    groupedNotices.set(hash, group);
  }
}

const lines = [
  "# Third-party notices",
  "",
  "This file is generated from the lockfiles and installed package sources used to build the macOS app. The packaging script copies it into `Somedue.app/Contents/Resources/THIRD_PARTY_NOTICES.md`, so any DMG made from that app carries these notices.",
  "",
  "The inventory covers normal native dependency edges for both Apple Silicon and Intel macOS targets, plus production frontend dependencies. Development-only tools are intentionally excluded.",
  "",
  "## Component inventory",
  "",
  "| Component | Origin | Declared license |",
  "| --- | --- | --- |",
  ...components.map(item => `| ${item.name} ${item.version} | ${item.origin} | ${item.license.replaceAll("|", "\\|")} |`),
  "",
  ...(missingNoticeFiles.length
    ? [
        "## Components without a package-local notice file",
        "",
        "These source packages declare the listed SPDX license but do not include a standalone `LICENSE`, `COPYING`, or `NOTICE` file in the installed package. Their declaration is retained in the inventory; the release review must resolve any package-specific notice before relying on a new version.",
        "",
        ...missingNoticeFiles.map(item => `- ${item.name} ${item.version} — ${item.license}`),
        "",
      ]
    : []),
  "## License texts",
  "",
];

for (const [hash, group] of [...groupedNotices.entries()].sort((left, right) => {
  const leftName = [...left[1].names].sort()[0];
  const rightName = [...right[1].names].sort()[0];
  return leftName.localeCompare(rightName);
})) {
  lines.push(`### ${[...group.files].sort().join(", ")} — ${hash}`);
  lines.push("");
  lines.push(`Applies to: ${[...group.names].sort().join(", ")}`);
  lines.push("");
  lines.push(group.text, "");
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${lines.join("\n")}\n`);
if (!existsSync(output) || readFileSync(output, "utf8").length < 1000) {
  throw new Error("Third-party notice generation produced an unexpectedly small file.");
}
console.log(`Wrote ${output}`);
