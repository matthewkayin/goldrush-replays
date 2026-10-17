import { maxReplayFileBytes, type UploadResult } from "@goldrush/shared";

export type RejectedUpload = Extract<UploadResult, { outcome: "rejected" }>;

const maxMegabytes = maxReplayFileBytes / (1024 * 1024);

// Sorts out the files the server would reject anyway, so they aren't sent.
// The server checks the size too; this only saves uploading them.
export function checkReplayFiles(files: File[]): {
  toUpload: File[];
  rejected: RejectedUpload[];
} {
  const toUpload: File[] = [];
  const rejected: RejectedUpload[] = [];
  for (const file of files) {
    const reason = rejectionReason(file);
    if (reason) {
      rejected.push({ outcome: "rejected", filename: file.name, reason });
    } else {
      toUpload.push(file);
    }
  }
  return { toUpload, rejected };
}

function rejectionReason(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".rep")) {
    return "Not a .rep file";
  }
  if (file.size > maxReplayFileBytes) {
    return `File is over ${maxMegabytes} MB`;
  }
  return null;
}
