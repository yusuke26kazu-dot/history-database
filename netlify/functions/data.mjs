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
      const previousData = await store.get("main", { type: "json" });
      const previousSavedAt = previousData?.savedAt ?? null;
      const baseSavedAt = body?.baseSavedAt ?? null;
      if (previousSavedAt && baseSavedAt !== previousSavedAt) {
        return jsonResponse(409, {
          error: "Outdated data",
          message: "The production database has newer data.",
          current: previousData,
        });
      }
      try {
        if (previousData) {
          await store.setJSON(`backups/${savedAt}`, previousData);
        }
      } catch {
        // Backup failures should not block the main save.
      }
      await store.setJSON("main", {
        ...body,
        baseSavedAt: undefined,
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
