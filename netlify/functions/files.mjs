import { getStore } from "@netlify/blobs";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function safeName(value) {
  return String(value || "file")
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

function keyFromRequest(request) {
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key");
  if (queryKey) return queryKey;
  const marker = "/files/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex >= 0) return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  return "";
}

export default async (request) => {
  const store = getStore({ name: "history-database-files", consistency: "strong" });

  if (request.method === "POST") {
    const fileName = request.headers.get("x-file-name") || "file";
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const bytes = Buffer.from(await request.arrayBuffer());
    const id = `${crypto.randomUUID()}-${safeName(fileName)}`;

    await store.set(id, bytes, {
      metadata: {
        name: fileName,
        type: mimeType,
      },
    });

    return jsonResponse(200, {
      ok: true,
      id,
      url: `/api/files/${encodeURIComponent(id)}?type=${encodeURIComponent(mimeType)}`,
    });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const key = keyFromRequest(request);
    if (!key) return jsonResponse(404, { error: "File not found" });

    const bytes = await store.get(key, { type: "arrayBuffer" });
    if (!bytes) return jsonResponse(404, { error: "File not found" });

    return {
      statusCode: 200,
      headers: {
        "content-type": url.searchParams.get("type") || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString("base64"),
    };
  }

  return jsonResponse(405, { error: "Method not allowed" });
};
