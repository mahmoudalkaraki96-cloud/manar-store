export function isPreviewReadOnlySql(query: string): boolean {
  const sql = query.trim();
  if (/^PRAGMA\b/i.test(sql)) {
    return /^PRAGMA\s+(?:TABLE_INFO|TABLE_XINFO|DATABASE_LIST|INDEX_LIST|INDEX_INFO|FOREIGN_KEY_LIST)\b/i.test(sql);
  }
  return !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|TRUNCATE)\b/i.test(sql);
}

export function previewReadOnlyDatabase<T extends object>(database: T): T {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (query: string) => {
          if (!isPreviewReadOnlySql(query)) {
            throw new Error("Database writes are disabled in preview mode");
          }
          return Reflect.get(target, property, receiver).call(target, query);
        };
      }
      if (property === "batch") {
        return () => {
          throw new Error("Database batches are disabled in preview mode");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export function previewReadOnlyResponse(method: string, previewMode: boolean): Response | null {
  if (!previewMode || method === "GET" || method === "HEAD") return null;
  return new Response("Preview mode is read-only", {
    status: 405,
    headers: {
      allow: "GET, HEAD",
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
