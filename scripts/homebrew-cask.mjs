import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const usage = `Usage:
  bun scripts/homebrew-cask.mjs --check-receipt RECEIPT [--check-receipt RECEIPT]
  bun scripts/homebrew-cask.mjs --arm-receipt RECEIPT --intel-receipt RECEIPT \\
    --arm-url URL --intel-url URL --output CASK`;

const targetByArchitecture = {
  arm64: "aarch64-apple-darwin",
  x86_64: "x86_64-apple-darwin",
};
const dmgName = /^Somedue-(.+)-(arm64|x86_64)\.dmg$/;
const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function receiptArtifact(receiptPath) {
  const resolvedReceipt = path.resolve(receiptPath);
  if (!existsSync(resolvedReceipt))
    throw new Error(`Missing package receipt: ${resolvedReceipt}`);

  let receipt;
  try {
    receipt = JSON.parse(readFileSync(resolvedReceipt, "utf8"));
  } catch {
    throw new Error(`Invalid package receipt: ${resolvedReceipt}`);
  }

  const architecture = requireValue(
    receipt.architecture,
    `Receipt is missing its architecture: ${resolvedReceipt}`,
  );
  if (!targetByArchitecture[architecture])
    throw new Error(`Unsupported receipt architecture: ${architecture}`);
  if (receipt.target !== targetByArchitecture[architecture]) {
    throw new Error(
      `Receipt target ${receipt.target} does not match ${architecture}.`,
    );
  }
  if (receipt.bundleId !== "io.somedue.desktop")
    throw new Error(`Unexpected bundle ID in ${resolvedReceipt}.`);

  const dmg = receipt.dmg;
  if (!dmg?.path || !dmg?.sha256)
    throw new Error(`Receipt is missing DMG metadata: ${resolvedReceipt}`);
  if (!/^[a-f0-9]{64}$/.test(dmg.sha256))
    throw new Error(`Receipt has an invalid DMG SHA-256: ${resolvedReceipt}`);

  const dmgPath = path.resolve(path.dirname(resolvedReceipt), dmg.path);
  if (!existsSync(dmgPath)) throw new Error(`Missing DMG: ${dmgPath}`);
  const match = path.basename(dmgPath).match(dmgName);
  if (!match || match[2] !== architecture || !version.test(match[1])) {
    throw new Error(`DMG filename does not match its receipt: ${dmgPath}`);
  }

  const actualSha256 = digest(readFileSync(dmgPath));
  if (actualSha256 !== dmg.sha256) {
    throw new Error(`DMG checksum does not match its receipt: ${dmgPath}`);
  }

  return {
    architecture,
    filename: path.basename(dmgPath),
    notarized: receipt.notarized,
    savedCloudCredentials: receipt.savedCloudCredentials,
    sha256: actualSha256,
    signing: receipt.signing,
    version: match[1],
  };
}

export function validateReceipt(receiptPath) {
  return receiptArtifact(receiptPath);
}

function checkedUrl(rawUrl, artifact) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid release URL for ${artifact.architecture}.`);
  }
  if (url.protocol !== "https:")
    throw new Error(`Release URL for ${artifact.architecture} must use HTTPS.`);
  if (!url.pathname.endsWith(`/${artifact.filename}`)) {
    throw new Error(
      `Release URL must end with ${artifact.filename} for ${artifact.architecture}.`,
    );
  }
  return url.toString();
}

async function verifiedRemoteArtifact(url, artifact, fetchImpl) {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Could not download ${artifact.architecture} release artifact (${response.status}).`,
    );
  }
  const remoteSha256 = digest(Buffer.from(await response.arrayBuffer()));
  if (remoteSha256 !== artifact.sha256) {
    throw new Error(
      `Published ${artifact.architecture} artifact does not match the verified receipt.`,
    );
  }
}

function caskText({ arm, intel }) {
  return `cask "somedue" do
  version "${arm.version}"

  on_arm do
    url "${arm.url}"
    sha256 "${arm.sha256}"
  end

  on_intel do
    url "${intel.url}"
    sha256 "${intel.sha256}"
  end

  name "Somedue"
  desc "Native macOS task manager"
  homepage "https://github.com/Heartkemy/somedue"

  app "Somedue.app"

  caveats <<~EOS
    Somedue requires macOS 13 or later.
    Homebrew keeps quarantine enabled so macOS can assess the app normally.
    This build does not support saving Things Cloud credentials.
  EOS
end
`;
}

export async function caskFromReceipts(
  { armReceipt, armUrl, intelReceipt, intelUrl },
  { fetchImpl = fetch } = {},
) {
  const arm = receiptArtifact(armReceipt);
  const intel = receiptArtifact(intelReceipt);
  if (arm.architecture !== "arm64" || intel.architecture !== "x86_64") {
    throw new Error(
      "Cask generation requires one arm64 and one x86_64 receipt.",
    );
  }
  if (arm.version !== intel.version)
    throw new Error("Cask artifacts must have the same version.");
  for (const artifact of [arm, intel]) {
    if (artifact.notarized !== true) {
      throw new Error(
        `${artifact.architecture} is not notarized and is not eligible for Cask generation.`,
      );
    }
    if (artifact.savedCloudCredentials !== false) {
      throw new Error(
        `${artifact.architecture} can save Cloud credentials and is outside this release scope.`,
      );
    }
  }

  arm.url = checkedUrl(armUrl, arm);
  intel.url = checkedUrl(intelUrl, intel);
  await Promise.all([
    verifiedRemoteArtifact(arm.url, arm, fetchImpl),
    verifiedRemoteArtifact(intel.url, intel, fetchImpl),
  ]);
  return caskText({ arm, intel });
}

function parseArgs(args) {
  const parsed = { checkReceipts: [] };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === "--check-receipt") {
      parsed.checkReceipts.push(
        requireValue(value, `${usage}\n--check-receipt needs a path.`),
      );
      index += 1;
      continue;
    }
    const key = {
      "--arm-receipt": "armReceipt",
      "--arm-url": "armUrl",
      "--intel-receipt": "intelReceipt",
      "--intel-url": "intelUrl",
      "--output": "output",
    }[option];
    if (!key) throw new Error(usage);
    parsed[key] = requireValue(value, `${usage}\n${option} needs a value.`);
    index += 1;
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.checkReceipts.length) {
    if (Object.keys(options).length !== 1) throw new Error(usage);
    console.log(
      JSON.stringify(options.checkReceipts.map(validateReceipt), null, 2),
    );
    return;
  }
  for (const key of [
    "armReceipt",
    "armUrl",
    "intelReceipt",
    "intelUrl",
    "output",
  ]) {
    requireValue(options[key], usage);
  }
  const cask = await caskFromReceipts(options);
  const output = path.resolve(options.output);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, cask);
  console.log(output);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
