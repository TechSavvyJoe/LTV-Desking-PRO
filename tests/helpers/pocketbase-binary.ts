import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const PINNED_POCKETBASE_VERSION = "0.39.6";
const RELEASE_CHECKSUMS: Record<string, string> = {
  darwin_amd64: "ee642cd5f8b2f77b4f28e36d93536e19887f42f1e01b384e1fe53775428aed88",
  darwin_arm64: "704111f6c4b489f27cebf525bcbe7fe0b98661a147f05f1c7b9dffeb89dcef6d",
  linux_amd64: "9251d4ebca4fe91771392dc389a6e449e4e00a34182b0316e7a2d9984d34da3d",
  linux_arm64: "1787ec2de1821f9464d835ccede697603d45eabe9078c3a4209442b3c6f7d18b",
};

function assertVersion(binary: string, expected: string) {
  let observed: string;
  try {
    observed = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  } catch {
    throw new Error("PocketBase binary is not executable; select a verified binary with PB_BIN.");
  }
  if (observed !== `pocketbase version ${expected}`) {
    throw new Error(
      `PocketBase version mismatch: expected ${expected}. Existing binary was preserved; select a matching verified binary with PB_BIN.`
    );
  }
}

/** Existing binaries must match the pin; downloads are hash checked before publication. */
export async function ensurePocketBaseBinary(
  targetPath: string,
  options: { version?: string; checksum?: string } = {}
): Promise<string> {
  const version = options.version || PINNED_POCKETBASE_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid PB_VERSION.");
  if (version !== PINNED_POCKETBASE_VERSION && !options.checksum) {
    throw new Error("PB_SHA256 is required when overriding PB_VERSION.");
  }
  if (options.checksum && !/^[a-fA-F0-9]{64}$/.test(options.checksum)) {
    throw new Error("Invalid PB_SHA256.");
  }
  if (fs.existsSync(targetPath)) {
    assertVersion(targetPath, version);
    return targetPath;
  }
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const platform = `${process.platform}_${arch}`;
  const expectedChecksum = options.checksum || RELEASE_CHECKSUMS[platform];
  if (!RELEASE_CHECKSUMS[platform] || !expectedChecksum) {
    throw new Error(`Unsupported PocketBase platform: ${platform}`);
  }
  const downloadDir = fs.mkdtempSync(path.join(tmpdir(), "ltv-pb-download-"));
  try {
    const zip = path.join(downloadDir, "pocketbase.zip");
    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${platform}.zip`;
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--max-time",
        "120",
        "--connect-timeout",
        "30",
        "--output",
        zip,
        url,
      ],
      { stdio: "inherit" }
    );
    const actual = createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
    if (actual !== expectedChecksum.toLowerCase())
      throw new Error("PocketBase archive checksum mismatch.");
    execFileSync("unzip", ["-q", zip, "-d", downloadDir], { stdio: "inherit" });
    const extracted = path.join(downloadDir, "pocketbase");
    fs.chmodSync(extracted, 0o755);
    assertVersion(extracted, version);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(extracted, targetPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(targetPath, 0o755);
    return targetPath;
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}
