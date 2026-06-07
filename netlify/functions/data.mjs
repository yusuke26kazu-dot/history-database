import { getStore } from "@netlify/blobs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

export default async (request) => {
  const store = getStore({ name: "history-database", consistency: "strong" });

  if (request.method === "GET") {
    const data = await store.get("main", { type: "json" });
    return jsonResponse(200, data ?? null);
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const previousData = await store.get("main", { type: "json" });
    const savedAt = new Date().toISOString();
    if (previousData) {
      await store.setJSON(`backups/${savedAt}`, previousData);
    }
    await store.setJSON("main", {
      ...body,
      savedAt,
    });
    return jsonResponse(200, { ok: true, savedAt });
  }

  return jsonResponse(405, { error: "Method not allowed" });
};
