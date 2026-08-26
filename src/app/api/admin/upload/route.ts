import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/adminAuth";

/**
 * Issues short-lived Vercel Blob client tokens so the browser can PUT a
 * PDF/cover directly to Blob storage, instead of routing the file bytes
 * through this serverless function first.
 *
 * This matters at our file sizes: Vercel's serverless functions cap request
 * bodies well under the 10-13MB our real magazine PDFs run — a server-side
 * `formData()` upload route would work fine here in the sandbox but fail in
 * production on Vercel. Client uploads (the officially recommended path for
 * anything past a few MB) sidestep that entirely: the file never touches
 * this function, only this small token exchange does.
 *
 * This route does NOT update the manifest — see POST /api/admin/editions,
 * called by the admin UI right after `upload()` resolves with the blob's
 * URL. That keeps the manifest write on the main request path (works the
 * same in local dev and on Vercel) instead of depending on Vercel Blob's
 * `onUploadCompleted` webhook, which needs a publicly reachable deployment
 * URL and doesn't fire during local development at all.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        addRandomSuffix: false,
        allowOverwrite: true,
        // Generous headroom above today's real editions (10.48-13.08MB).
        maximumSizeInBytes: 200 * 1024 * 1024,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[admin/upload]", err);
    const message = err instanceof Error ? err.message : "Error generando el token de subida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
