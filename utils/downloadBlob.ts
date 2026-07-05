export type BlobDownloadErrorCode =
  | "browser_unsupported"
  | "empty_blob"
  | "wrong_type"
  | "filename_empty";

export class BlobDownloadError extends Error {
  readonly code: BlobDownloadErrorCode;

  constructor(code: BlobDownloadErrorCode, message: string) {
    super(message);
    this.name = "BlobDownloadError";
    this.code = code;
  }
}

export interface BlobDownloadOptions {
  expectedType?: string;
  minBytes?: number;
  revokeAfterMs?: number;
}

export interface BlobDownloadResult {
  status: "download-triggered";
  filename: string;
  url: string;
  revoke: () => void;
}

const DEFAULT_REVOKE_AFTER_MS = 60_000;

export const sanitizeDownloadFilename = (filename: string, fallback = "download.pdf"): string => {
  const withoutControls = Array.from(filename.trim())
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("");

  const clean = withoutControls
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const candidate = clean || fallback;
  if (!candidate) {
    throw new BlobDownloadError("filename_empty", "Download filename is empty.");
  }
  return candidate.toLowerCase().endsWith(".pdf") ? candidate : `${candidate}.pdf`;
};

export const assertDownloadBlob = (
  blob: Blob,
  { expectedType = "application/pdf", minBytes = 512 }: BlobDownloadOptions = {}
): void => {
  if (!(blob instanceof Blob) || blob.size < minBytes) {
    throw new BlobDownloadError(
      "empty_blob",
      `Generated file is too small to download safely (${blob?.size ?? 0} bytes).`
    );
  }

  if (expectedType && blob.type && blob.type !== expectedType) {
    throw new BlobDownloadError(
      "wrong_type",
      `Generated file type ${blob.type} did not match ${expectedType}.`
    );
  }
};

export const downloadBlob = (
  blob: Blob,
  filename: string,
  options: BlobDownloadOptions = {}
): BlobDownloadResult => {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    throw new BlobDownloadError(
      "browser_unsupported",
      "Browser download APIs are unavailable in this environment."
    );
  }

  assertDownloadBlob(blob, options);
  const safeFilename = sanitizeDownloadFilename(filename);
  const url = URL.createObjectURL(blob);
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  };

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(revoke, options.revokeAfterMs ?? DEFAULT_REVOKE_AFTER_MS);

  return {
    status: "download-triggered",
    filename: safeFilename,
    url,
    revoke,
  };
};
