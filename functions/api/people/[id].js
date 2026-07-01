import { getRows, hasHeader, json, updateRange } from "../../_shared/sheets.js";

export async function onRequestPatch(context) {
  try {
    const { request, env, params } = context;
    const body = await request.json();
    const adjustment = Number(body.adjustment);

    if (!Number.isFinite(adjustment)) {
      return json({ error: "Adjustment must be a number." }, 400);
    }

    const rows = await getRows(env);
    if (!hasHeader(rows)) {
      return json({ error: "Sheet headers are missing." }, 400);
    }

    const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === params.id);
    if (rowIndex === -1) return json({ error: "Person not found." }, 404);

    const row = rows[rowIndex];
    const updated = {
      id: row[0],
      name: row[1],
      balance: Number(row[2] || 0) + adjustment,
      updated_at: new Date().toISOString(),
    };

    await updateRange(env, `A${rowIndex + 1}:D${rowIndex + 1}`, [
      [updated.id, updated.name, updated.balance, updated.updated_at],
    ]);

    return json(updated);
  } catch (error) {
    return json({ error: error.message || "Unexpected error." }, 500);
  }
}
