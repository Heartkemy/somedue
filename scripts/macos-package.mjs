import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { stageKeychainHelper } from "./keychain-helper.mjs";
import { verifyArchitectureArgs } from "./macos-lipo.mjs";

const root = path.resolve(import.meta.dirname, "..");
const defaultCargoTarget =
  process.env.CARGO_TARGET_DIR ||
  path.join(homedir(), "Library/Caches/Somedue/cargo-target");
const defaultOutputRoot = path.join(root, "out", "macos");
const usage =
  "Usage: bun scripts/macos-package.mjs [--install] [--skip-build] [--dmg] [--target TARGET | --all-targets]";

export const macOSTargets = {
  "aarch64-apple-darwin": { arch: "arm64", name: "arm64" },
  "x86_64-apple-darwin": { arch: "x86_64", name: "x86_64" },
};

function hostMacArchitecture(hostArchitecture) {
  if (hostArchitecture === "arm64") return "arm64";
  if (hostArchitecture === "x64") return "x86_64";
  throw new Error(`Unsupported macOS host architecture: ${hostArchitecture}`);
}

function defaultTarget(hostArchitecture) {
  const arch = hostMacArchitecture(hostArchitecture);
  return Object.entries(macOSTargets).find(
    ([, target]) => target.arch === arch,
  )[0];
}

export function packagePlan(
  args,
  {
    hostArchitecture = process.arch,
    cargoTarget = defaultCargoTarget,
    outputRoot = defaultOutputRoot,
    outputMode = "ad-hoc",
  } = {},
) {
  let install = false;
  let skipBuild = false;
  let dmg = false;
  let allTargets = false;
  let requestedTarget;

  for (let index = 0; index < args.length; index += 1) {
    switch (args[index]) {
      case "--install":
        install = true;
        break;
      case "--skip-build":
        skipBuild = true;
        break;
      case "--dmg":
        dmg = true;
        break;
      case "--all-targets":
        allTargets = true;
        break;
      case "--target":
        if (requestedTarget)
          throw new Error(`${usage}\n--target may be supplied once.`);
        requestedTarget = args[++index];
        if (!requestedTarget)
          throw new Error(`${usage}\n--target requires a target triple.`);
        break;
      default:
        throw new Error(usage);
    }
  }

  if (allTargets && requestedTarget) {
    throw new Error(`${usage}\nUse --target or --all-targets, not both.`);
  }
  if (requestedTarget && !macOSTargets[requestedTarget]) {
    throw new Error(`${usage}\nUnsupported macOS target: ${requestedTarget}`);
  }
  if (install && (dmg || allTargets)) {
    throw new Error(
      "--install only supports one host .app and cannot create a DMG.",
    );
  }

  const triples = allTargets
    ? Object.keys(macOSTargets)
    : [requestedTarget || defaultTarget(hostArchitecture)];
  const hostArch = hostMacArchitecture(hostArchitecture);
  if (install && macOSTargets[triples[0]].arch !== hostArch) {
    throw new Error(
      "--install only supports the native host target; cross-target installs may run under Rosetta.",
    );
  }

  return {
    install,
    skipBuild,
    dmg,
    targets: triples.map((triple) => {
      const target = macOSTargets[triple];
      const outputDir = path.join(outputRoot, outputMode, target.name);
      return {
        triple,
        ...target,
        app: path.join(cargoTarget, triple, "release/bundle/macos/Somedue.app"),
        outputDir,
        artifactApp: path.join(outputDir, "Somedue.app"),
        receipt: path.join(outputDir, "build-receipt.json"),
        buildArgs: [
          "run",
          "tauri",
          "build",
          "--target",
          triple,
          "--bundles",
          "app",
          "--no-sign",
        ],
      };
    }),
  };
}

const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
const read = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  }).trim();
const plist = (app, key) =>
  read("/usr/libexec/PlistBuddy", [
    "-c",
    `Print :${key}`,
    path.join(app, "Contents/Info.plist"),
  ]);

function requireTargetStdlib(target) {
  const libdir = read(process.env.RUSTC || "rustc", [
    "--print",
    "target-libdir",
    "--target",
    target.triple,
  ]);
  if (
    !existsSync(libdir) ||
    !readdirSync(libdir).some((file) => file.startsWith("libcore"))
  ) {
    throw new Error(
      `Rust target ${target.triple} is unavailable. Install that target in the selected Rust toolchain, then retry.`,
    );
  }
}

function machOFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && read("file", ["-b", file]).includes("Mach-O"))
        files.push(file);
    }
  };
  visit(directory);
  return files;
}

function verifyArchitecture(app, target) {
  const binaries = machOFiles(app);
  if (!binaries.length)
    throw new Error(`No Mach-O executable found in ${app}.`);
  for (const binary of binaries) {
    const architectures = read("lipo", ["-archs", binary])
      .split(/\s+/)
      .filter(Boolean);
    if (architectures.length !== 1 || architectures[0] !== target.arch) {
      throw new Error(
        `${binary} must be a thin ${target.arch} binary; found ${architectures.join(", ") || "none"}.`,
      );
    }
    run("lipo", verifyArchitectureArgs(binary, target.arch));
  }
}

function verifyAdHocCredentialBoundary(executable) {
  for (const [operation, refusal] of [
    ["create", "without its signing identity"],
    ["cloud", "local-only"],
  ]) {
    const result = spawnSync(
      executable,
      ["--keychain-self-test", operation, "verification-package-boundary"],
      { encoding: "utf8" },
    );
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    if (result.status === 0 || !output.includes(refusal)) {
      throw new Error(`Ad-hoc package did not refuse ${operation} access.`);
    }
  }
}

function verifyBundle(
  app,
  target,
  { adHoc, verifyCredentialBoundary = false } = {},
) {
  if (!existsSync(app)) throw new Error(`Missing app bundle: ${app}`);
  const bundleId = plist(app, "CFBundleIdentifier");
  if (bundleId !== "io.somedue.desktop")
    throw new Error(`Unexpected bundle identity: ${bundleId}`);
  const executable = path.join(
    app,
    "Contents/MacOS",
    plist(app, "CFBundleExecutable"),
  );
  run("codesign", ["--verify", "--deep", "--strict", app]);
  verifyArchitecture(app, target);
  const notices = path.join(app, "Contents/Resources/THIRD_PARTY_NOTICES.md");
  if (!existsSync(notices))
    throw new Error(`Missing bundled third-party notices: ${notices}`);
  if (adHoc && verifyCredentialBoundary)
    verifyAdHocCredentialBoundary(executable);
  return {
    bundleId,
    executable,
    executableSha256: digest(executable),
    minimumSystemVersion: plist(app, "LSMinimumSystemVersion"),
    noticesSha256: digest(notices),
  };
}

function copyApp(source, destination) {
  const staging = mkdtempSync(
    path.join(path.dirname(destination), ".app-stage-"),
  );
  try {
    const staged = path.join(staging, path.basename(destination));
    run("ditto", [source, staged]);
    rmSync(destination, { recursive: true, force: true });
    renameSync(staged, destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function previewReadme({ version, target, adHoc }) {
  return [
    `Somedue ${version} (${target.name})`,
    "",
    `Signing: ${adHoc ? "ad-hoc" : "local certificate"}. This build is not notarized.`,
    adHoc
      ? "This local-only alpha cannot save Things Cloud credentials or connect to Things Cloud."
      : "This local certificate-signed build uses the configured Keychain credential boundary.",
    "macOS Gatekeeper may block unnotarized builds. This image does not remove quarantine attributes or change macOS security policy.",
    "Install by copying Somedue.app normally. Do not bypass macOS security protections.",
    "",
  ].join("\n");
}

function mountedDmgPath(dmg) {
  const attachment = read("hdiutil", [
    "attach",
    "-readonly",
    "-nobrowse",
    "-plist",
    dmg,
  ]);
  const mounted = JSON.parse(
    read("plutil", ["-convert", "json", "-o", "-", "-"], { input: attachment }),
  )["system-entities"].find((entity) => entity["mount-point"]);
  if (!mounted)
    throw new Error(`Could not determine the mount point for ${dmg}.`);
  return mounted["mount-point"];
}

function createAndVerifyDmg({
  target,
  version,
  adHoc,
  verifyCredentialBoundary,
}) {
  const dmg = path.join(
    target.outputDir,
    `Somedue-${version}-${target.name}.dmg`,
  );
  const staging = mkdtempSync(path.join(target.outputDir, ".dmg-stage-"));
  try {
    run("ditto", [target.artifactApp, path.join(staging, "Somedue.app")]);
    writeFileSync(
      path.join(staging, "README.txt"),
      previewReadme({ version, target, adHoc }),
    );
    rmSync(dmg, { force: true });
    run("hdiutil", [
      "create",
      "-ov",
      "-format",
      "UDZO",
      "-volname",
      "Somedue",
      "-srcfolder",
      staging,
      dmg,
    ]);
    run("hdiutil", ["verify", dmg]);
    let mountPoint;
    try {
      mountPoint = mountedDmgPath(dmg);
      const mountedApp = path.join(mountPoint, "Somedue.app");
      const readme = readFileSync(path.join(mountPoint, "README.txt"), "utf8");
      if (
        !readme.includes("not notarized") ||
        (adHoc && !readme.includes("cannot save Things Cloud credentials"))
      ) {
        throw new Error(
          "Mounted DMG is missing the required ad-hoc safety notice.",
        );
      }
      verifyBundle(mountedApp, target, { adHoc, verifyCredentialBoundary });
    } finally {
      if (mountPoint) run("hdiutil", ["detach", mountPoint]);
    }
    return { path: path.basename(dmg), sha256: digest(dmg) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function currentIdentity() {
  const identityFile = path.join(
    homedir(),
    "Library/Application Support/Somedue/macos-signing-identity",
  );
  const identity = (
    process.env.SOMEDUE_CODESIGN_IDENTITY ??
    (existsSync(identityFile) ? readFileSync(identityFile, "utf8").trim() : "-")
  ).toUpperCase();
  if (identity !== "-" && !/^[A-F0-9]{40}$/.test(identity)) {
    throw new Error(
      'Signing identity must be a SHA-1 certificate fingerprint or explicit "-".',
    );
  }
  if (identity !== "-") {
    const available = read("security", ["find-identity", "-p", "codesigning"]);
    if (!available.includes(identity)) {
      throw new Error(
        "Configured signing certificate unavailable; refusing ad-hoc fallback.",
      );
    }
  }
  return identity;
}

function readReceipt(file) {
  if (!existsSync(file)) throw new Error(`Missing package receipt: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function main() {
  if (process.platform !== "darwin")
    throw new Error("Packaging requires macOS.");
  const identity = currentIdentity();
  const adHoc = identity === "-";
  const plan = packagePlan(process.argv.slice(2), {
    outputMode: adHoc ? "ad-hoc" : "certificate",
  });
  if (plan.install) {
    console.log(
      "Building current working files, including uncommitted changes. Somedue will restart after installation; save open edits first.",
    );
  }

  const { SOMEDUE_SIGNER: _discardedSigner, ...cleanEnvironment } = process.env;
  const buildEnvironment = {
    ...cleanEnvironment,
    CARGO_TARGET_DIR: defaultCargoTarget,
    MACOSX_DEPLOYMENT_TARGET: "13.0",
    ...(adHoc ? {} : { SOMEDUE_SIGNER: identity }),
  };
  if (!plan.skipBuild) run("bun", ["run", "icons"]);
  run("bun", ["run", "notices"]);

  const results = [];
  for (const target of plan.targets) {
    if (!plan.skipBuild) {
      requireTargetStdlib(target);
      run("bun", target.buildArgs, { env: buildEnvironment });
    }
    if (!existsSync(target.app))
      throw new Error(`Missing bundle: ${target.app}`);

    const previous = plan.skipBuild ? readReceipt(target.receipt) : null;
    const sourceExecutable = path.join(
      target.app,
      "Contents/MacOS",
      plist(target.app, "CFBundleExecutable"),
    );
    if (
      previous &&
      (previous.target !== target.triple ||
        previous.identity !== identity ||
        previous.executableSha256 !== digest(sourceExecutable) ||
        previous.cloudAccess !== !adHoc ||
        previous.savedCloudCredentials !== !adHoc)
    ) {
      throw new Error(
        "Cannot skip build: the target app has no matching package receipt and credential mode.",
      );
    }

    const notices = path.join(root, "out/THIRD_PARTY_NOTICES.md");
    const bundledNotices = path.join(
      target.app,
      "Contents/Resources/THIRD_PARTY_NOTICES.md",
    );
    copyFileSync(notices, bundledNotices);
    if (digest(notices) !== digest(bundledNotices)) {
      throw new Error(
        "Bundled third-party notices do not match the generated source.",
      );
    }

    const helper = adHoc
      ? null
      : stageKeychainHelper(
          path.join(target.app, "Contents/Resources"),
          identity,
          target.arch,
        );
    run("codesign", [
      "--force",
      "--sign",
      identity,
      "--timestamp=none",
      "--identifier",
      "io.somedue.desktop",
      target.app,
    ]);
    verifyBundle(target.app, target, { adHoc });
    if (
      helper &&
      digest(path.join(target.app, "Contents/Resources/somedue-keychain")) !==
        helper.sha256
    ) {
      throw new Error("Signing changed the frozen Keychain helper.");
    }

    mkdirSync(target.outputDir, { recursive: true });
    copyFileSync(
      notices,
      path.join(target.outputDir, "THIRD_PARTY_NOTICES.md"),
    );
    copyApp(target.app, target.artifactApp);
    const artifact = verifyBundle(target.artifactApp, target, {
      adHoc,
      verifyCredentialBoundary:
        adHoc && target.arch === hostMacArchitecture(process.arch),
    });
    const receipt = {
      target: target.triple,
      architecture: target.arch,
      bundleId: artifact.bundleId,
      app: target.artifactApp,
      sourceApp: target.app,
      executableSha256: artifact.executableSha256,
      thirdPartyNoticesSha256: artifact.noticesSha256,
      keychainHelper: helper,
      signing: adHoc ? "ad-hoc local build" : "certificate signed local build",
      identity,
      notarized: false,
      savedCloudCredentials: !adHoc,
      cloudAccess: !adHoc,
      minimumSystemVersion: artifact.minimumSystemVersion,
      builtAt: new Date().toISOString(),
      sourceCommit: read("git", ["rev-parse", "HEAD"]),
      hostArchitecture: process.arch,
      nativeRuntimeCheck:
        adHoc && target.arch === hostMacArchitecture(process.arch),
    };
    if (plan.dmg) {
      receipt.dmg = createAndVerifyDmg({
        target,
        version: plist(target.artifactApp, "CFBundleShortVersionString"),
        adHoc,
        verifyCredentialBoundary: receipt.nativeRuntimeCheck,
      });
    }
    writeFileSync(target.receipt, JSON.stringify(receipt, null, 2));
    if (
      plan.targets.length === 1 &&
      target.arch === hostMacArchitecture(process.arch)
    ) {
      writeFileSync(
        path.join(root, "out/build-receipt.json"),
        JSON.stringify(receipt, null, 2),
      );
    }
    results.push(receipt);
  }

  if (plan.install) {
    const [target] = plan.targets;
    const destination = "/Applications/Somedue.app";
    const stage = `/Applications/.Somedue-staging-${process.pid}.app`;
    run("ditto", [target.artifactApp, stage]);
    run("codesign", ["--verify", "--deep", "--strict", stage]);
    if (existsSync(destination)) {
      const previousId = plist(destination, "CFBundleIdentifier");
      if (previousId !== "io.somedue.desktop") {
        throw new Error(
          "Existing installation has a different identity; refusing replacement.",
        );
      }
      const backupDir = path.join(
        homedir(),
        "Library/Application Support/Somedue/installation-backups",
      );
      mkdirSync(backupDir, { recursive: true });
      const backup = path.join(backupDir, `Somedue-${Date.now()}.app`);
      run("ditto", [destination, backup]);
      const retired = `/Applications/.Somedue-retired-${process.pid}.app`;
      renameSync(destination, retired);
      try {
        renameSync(stage, destination);
      } catch (error) {
        renameSync(retired, destination);
        throw error;
      }
      results[0].previousInstallation = retired;
      results[0].backup = backup;
    } else renameSync(stage, destination);
    run("codesign", ["--verify", "--deep", "--strict", destination]);
    if (
      digest(
        path.join(
          destination,
          "Contents/MacOS",
          plist(destination, "CFBundleExecutable"),
        ),
      ) !== results[0].executableSha256
    ) {
      throw new Error("Installed executable does not match the build.");
    }
    results[0].installedPath = destination;
    run("osascript", [
      "-e",
      `
if application id "io.somedue.desktop" is running then
  tell application id "io.somedue.desktop" to quit
  repeat 100 times
    if not (application id "io.somedue.desktop" is running) then exit repeat
    delay 0.1
  end repeat
  if application id "io.somedue.desktop" is running then error "Somedue did not quit. Save your edits and quit it, then run the command again."
end if`,
    ]);
    run("open", ["-a", destination]);
    console.log(`Installed and opened ${destination}`);
  }

  console.log(JSON.stringify(results, null, 2));
}

if (import.meta.main) main();
