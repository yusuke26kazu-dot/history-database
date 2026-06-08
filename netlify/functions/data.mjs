import { getStore } from "@netlify/blobs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers,
  });
}

export default async (request) => {
  try {
    const store = getStore({ name: "history-database", consistency: "strong" });

    if (request.method === "GET") {
      const data = await store.get("main", { type: "json" });
      return jsonResponse(200, data ?? null);
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const savedAt = new Date().toISOString();
      try {
        const previousData = await store.get("main", { type: "json" });
        if (previousData) {
          await store.setJSON(`backups/${savedAt}`, previousData);
        }
      } catch {
        // Backup failures should not block the main save.
      }
      await store.setJSON("main", {
        ...body,
        savedAt,
      });
      return jsonResponse(200, { ok: true, savedAt });
    }

    return jsonResponse(405, { error: "Method not allowed" });
  } catch (error) {
    return jsonResponse(500, {
      error: "Save API failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
