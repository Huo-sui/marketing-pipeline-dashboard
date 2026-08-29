import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { once } from "node:events";
import type { ArtifactPutInput, ArtifactStorage, StoredArtifact } from "./ArtifactStorage.js";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": ".mp3", "audio/wav": ".wav", "image/gif": ".gif", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  "application/json": ".json", "text/plain": ".txt", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
};
const MIME_ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  "audio/mpeg": new Set([".mp3"]),
  "audio/wav": new Set([".wav", ".wave"]),
  "image/gif": new Set([".gif"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "application/json": new Set([".json"]),
  "text/plain": new Set([".txt"]),
  "video/mp4": new Set([".mp4"]),
  "video/quicktime": new Set([".mov", ".qt"]),
  "video/webm": new Set([".webm"]),
};
const MAX_FILE_BYTES = 512 * 1024 * 1024;

export class ArtifactStorageError extends Error {
  readonly code = "ARTIFACT_STORAGE_ERROR";
}

function safeSegment(value: string) {
  if (!/^[0-9a-f-]{8,128}$/i.test(value)) throw new ArtifactStorageError("Artifact 路径标识无效");
  return value;
}

export function validateArtifactName(mimeType: string, originalName?: string) {
  const extension = originalName ? extname(basename(originalName)).toLowerCase() : "";
  const allowedExtensions = MIME_ALLOWED_EXTENSIONS[mimeType];
  if (extension && allowedExtensions && !allowedExtensions.has(extension)) {
    throw new ArtifactStorageError(`Artifact MIME 与文件扩展名不匹配: ${mimeType} / ${extension}`);
  }
}

export class LocalArtifactStorage implements ArtifactStorage {
  readonly root: string;

  constructor(root = process.env.MARKETING_PIPELINE_DATA_DIR || join(process.cwd(), "data", "runtime")) {
    this.root = resolve(root);
  }

  private finalPath(id: string) {
    const path = resolve(join(this.root, "artifacts", `${safeSegment(id)}.bin`));
    const root = resolve(join(this.root, "artifacts"));
    if (relative(root, path).startsWith("..")) throw new ArtifactStorageError("拒绝访问 Artifact 路径");
    return path;
  }

  async put(input: ArtifactPutInput): Promise<StoredArtifact> {
    const id = safeSegment(input.id);
    validateArtifactName(input.mimeType, input.originalName);
    const finalPath = this.finalPath(id);
    const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(finalPath), { recursive: true });
    const hash = createHash("sha256");
    const output = createWriteStream(tempPath, { flags: "wx" });
    let sizeBytes = 0;
    try {
      for await (const chunk of input.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += buffer.byteLength;
        if (sizeBytes > MAX_FILE_BYTES) throw new ArtifactStorageError("Artifact 超过 512 MB 限制");
        hash.update(buffer);
        if (!output.write(buffer)) await once(output, "drain");
      }
      if (!sizeBytes) throw new ArtifactStorageError("Artifact 文件不能为空");
      output.end();
      await once(output, "close");
      await rename(tempPath, finalPath);
      return { id, storageKey: join("artifacts", `${id}.bin`).replaceAll("\\", "/"), sizeBytes, sha256: hash.digest("hex"), mimeType: input.mimeType };
    } catch (error) {
      output.destroy();
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async get(id: string) {
    const path = this.finalPath(id);
    await stat(path).catch(() => { throw new ArtifactStorageError("Artifact 文件不存在"); });
    return createReadStream(path);
  }

  async delete(id: string) { await rm(this.finalPath(id), { force: true }); }

  async getMetadata(id: string) {
    const file = await stat(this.finalPath(id)).catch(() => { throw new ArtifactStorageError("Artifact 文件不存在"); });
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(this.finalPath(id))) hash.update(chunk);
    return { id, storageKey: join("artifacts", `${id}.bin`).replaceAll("\\", "/"), sizeBytes: file.size, sha256: hash.digest("hex"), mimeType: "application/octet-stream" };
  }
}

export function artifactExtension(mimeType: string, originalName?: string) {
  return MIME_EXTENSIONS[mimeType] ?? (originalName ? extname(basename(originalName)).toLowerCase().replace(/[^a-z0-9.]/g, "") : "");
}
