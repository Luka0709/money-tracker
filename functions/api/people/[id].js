import {
  appendRow,
  ensureTransactionsSheet,
  getRows,
  hasHeader,
  json,
  rowToPerson,
  transactionsSheetName,
  updateRange,
} from "../../_shared/sheets.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const rows = await getRows(env);
    if (!hasHeader(rows)) {
      return json({ error: "Sheet headers are missing." }, 400);
    }

    const row = rows.find((item, index) => index > 0 && item[0] === params.id);
    if (!row) return json({ error: "Person not found." }, 404);

    return json(rowToPerson(row));
  } catch (error) {
    return json({ error: error.message || "Unexpected error." }, 500);
  }
}

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
    const now = new Date().toISOString();
    const updated = {
      id: row[0],
      name: row[1],
      balance: Number(row[2] || 0) + adjustment,
      updated_at: now,
    };

    await updateRange(env, `A${rowIndex + 1}:D${rowIndex + 1}`, [
      [updated.id, updated.name, updated.balance, updated.updated_at],
    ]);
    await ensureTransactionsSheet(env);
    await appendRow(
      env,
      [crypto.randomUUID(), updated.id, updated.name, adjustment, updated.balance, now],
      transactionsSheetName(env),
      "A:F",
    );

    return json(updated);
  } catch (error) {
    return json({ error: error.message || "Unexpected error." }, 500);
  }
}
