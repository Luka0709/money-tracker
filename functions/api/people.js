import { HEADERS, appendRow, getRows, hasHeader, json, rowToPerson, updateRange } from "../_shared/sheets.js";

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const method = request.method.toUpperCase();

    if (method === "GET") {
      return json(await listPeople(env));
    }

    if (method === "POST") {
      const body = await request.json();
      const name = String(body.name || "").trim();
      if (!name) return json({ error: "Name is required." }, 400);

      const person = {
        id: crypto.randomUUID(),
        name,
        balance: 0,
        updated_at: new Date().toISOString(),
      };

      await appendRow(env, [person.id, person.name, person.balance, person.updated_at]);
      return json(person, 201);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    return json({ error: error.message || "Unexpected error." }, 500);
  }
}

async function listPeople(env) {
  const rows = await getRows(env);

  if (!hasHeader(rows)) {
    await updateRange(env, "A1:D1", [HEADERS]);
    return [];
  }

  return rows.slice(1).filter((row) => row[0] && row[1]).map(rowToPerson);
}
