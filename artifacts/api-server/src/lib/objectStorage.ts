import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = process.env.STORAGE_BUCKET ?? "uploads";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  return createClient(url, key);
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class StorageFile {
  constructor(
    public readonly bucket: string,
    public readonly path: string,
    public readonly mimeType?: string,
  ) {}
}

export class ObjectStorageService {
  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    const supabase = getSupabase();
    const parts = filePath.split("/");
    const name = parts.pop()!;
    const dir = ["public", ...parts].join("/");
    const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: name });
    if (error || !data?.length) return null;
    const found = data.find(f => f.name === name);
    if (!found) return null;
    return new StorageFile(BUCKET, `${dir}/${name}`);
  }

  async downloadObject(file: StorageFile): Promise<Response> {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage.from(file.bucket).download(file.path);
    if (error || !data) throw new ObjectNotFoundError();
    const arrayBuffer = await data.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": file.mimeType ?? data.type ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(arrayBuffer.byteLength),
      },
    });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const supabase = getSupabase();
    const path = `objects/uploads/${randomUUID()}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Failed to generate upload URL: ${error?.message}`);
    return data.signedUrl;
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const supabase = getSupabase();
    const relativePath = objectPath.slice(1);
    const parts = relativePath.split("/");
    const name = parts.pop()!;
    const dir = parts.join("/");
    const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: name });
    if (error || !data?.length) throw new ObjectNotFoundError();
    if (!data.find(f => f.name === name)) throw new ObjectNotFoundError();
    return new StorageFile(BUCKET, relativePath);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:upload\/sign|sign)\/[^/]+\/(.+)/);
      if (match) return `/objects/${match[1]}`;
    } catch {}
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, _policy: unknown): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(_opts: unknown): Promise<boolean> {
    return true;
  }
}
