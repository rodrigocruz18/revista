"use client";

import { upload } from "@vercel/blob/client";

/**
 * Browser → Vercel Blob upload for the admin (token from /api/admin/upload).
 * `name` is the pathname without extension, e.g. "sponsors/<id>/horizontal";
 * a unique suffix is always added, so a replacement never collides with —
 * or is masked by a CDN-cached copy of — the file it replaces.
 */
export async function uploadAdminFile(
  name: string,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<{ url: string; pathname: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const blob = await upload(`${name}-${Date.now().toString(36)}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/admin/upload",
    contentType: file.type || undefined,
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: onProgress ? (p) => onProgress(p.percentage) : undefined,
  });
  return { url: blob.url, pathname: blob.pathname };
}

/** Natural pixel size of an image (a picked File or an already-uploaded URL). */
export function readImageSize(source: File | string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}
