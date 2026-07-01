const HEADERS = ["id", "name", "balance", "updated_at"];
const TRANSACTION_HEADERS = ["id", "person_id", "person_name", "adjustment", "balance_after", "note", "excluded", "created_at"];
const BACKUP_PREFIX = "Backup_";
let accessTokenCache = null;

export { HEADERS, TRANSACTION_HEADERS };

export async function getRows(env, rangeName = "A:D", tabName = sheetName(env)) {
  const data = await sheetsRequest(env, "GET", valuesUrl(env, rangeName, tabName));
  return data.values || [];
}

export async function appendRow(env, row, tabName = sheetName(env), columns = "A:D") {
  const range = encodeURIComponent(`${tabName}!${columns}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsRequest(env, "POST", url, { values: [row] });
}

export async function updateRange(env, rangeName, values, tabName = sheetName(env)) {
  const url = valuesUrl(env, rangeName, tabName) + "?valueInputOption=USER_ENTERED";
  await sheetsRequest(env, "PUT", url, { values });
}

export function hasHeader(rows) {
  return rows[0]?.slice(0, 4).join("|").toLowerCase() === HEADERS.join("|");
}

export function rowToPerson(row) {
  return {
    id: row[0],
    name: row[1],
    balance: Number(row[2] || 0),
    updated_at: row[3] || "",
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function ensureTransactionsSheet(env) {
  const tabName = transactionsSheetName(env);

  try {
    const rows = await getRows(env, "A:H", tabName);
    if (rows[0]?.slice(0, 8).join("|").toLowerCase() !== TRANSACTION_HEADERS.join("|")) {
      await updateRange(env, "A1:H1", [TRANSACTION_HEADERS], tabName);
    }
    return;
  } catch (error) {
    if (!String(error.message || "").includes("Unable to parse range")) throw error;
  }

  await sheetsRequest(
    env,
    "POST",
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}:batchUpdate`,
    { requests: [{ addSheet: { properties: { title: tabName } } }] },
  );
  await updateRange(env, "A1:H1", [TRANSACTION_HEADERS], tabName);
}

export function transactionsSheetName(env) {
  return env.TRANSACTIONS_SHEET_NAME || "Transactions";
}

export async function createBackup(env, backedUpAt = new Date().toISOString()) {
  const title = `${backupSheetTitle(backedUpAt)}_${crypto.randomUUID().slice(0, 8)}`;
  const peopleRows = await getRows(env, "A:D");
  const transactionRows = await getTransactionRows(env);
  const backupRows = [
    ["Backed up at", backedUpAt],
    [],
    ["People"],
    ...(peopleRows.length ? peopleRows : [HEADERS]),
    [],
    ["Transactions"],
    ...(transactionRows.length ? transactionRows : [TRANSACTION_HEADERS]),
  ];

  await sheetsRequest(
    env,
    "POST",
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}:batchUpdate`,
    { requests: [{ addSheet: { properties: { title } } }] },
  );
  await updateRange(env, `A1:H${backupRows.length}`, backupRows, title);
  await pruneBackups(env);
}

async function getTransactionRows(env) {
  try {
    return await getRows(env, "A:H", transactionsSheetName(env));
  } catch (error) {
    if (String(error.message || "").includes("Unable to parse range")) return [TRANSACTION_HEADERS];
    throw error;
  }
}

async function pruneBackups(env) {
  const spreadsheet = await sheetsRequest(
    env,
    "GET",
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}?fields=sheets.properties(sheetId,title)`,
  );
  const backups = (spreadsheet.sheets || [])
    .map((sheet) => sheet.properties)
    .filter((sheet) => sheet.title.startsWith(BACKUP_PREFIX))
    .sort((a, b) => a.title.localeCompare(b.title));
  const oldBackups = backups.slice(0, Math.max(0, backups.length - 5));

  if (!oldBackups.length) return;

  await sheetsRequest(
    env,
    "POST",
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}:batchUpdate`,
    { requests: oldBackups.map((sheet) => ({ deleteSheet: { sheetId: sheet.sheetId } })) },
  );
}

function backupSheetTitle(value) {
  return `${BACKUP_PREFIX}${value.replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-")}`;
}

function valuesUrl(env, rangeName, tabName = sheetName(env)) {
  const range = encodeURIComponent(`${tabName}!${rangeName}`);
  return `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}`;
}

function sheetName(env) {
  return env.SHEET_NAME || "Sheet1";
}

async function sheetsRequest(env, method, url, body) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Google Sheets request failed.");
  }
  return data;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (
    accessTokenCache &&
    accessTokenCache.email === env.GOOGLE_CLIENT_EMAIL &&
    accessTokenCache.expiresAt > now + 60
  ) {
    return accessTokenCache.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${arrayBufferToBase64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Could not authenticate with Google.");
  accessTokenCache = {
    email: env.GOOGLE_CLIENT_EMAIL,
    expiresAt: now + Number(data.expires_in || 3600),
    token: data.access_token,
  };
  return data.access_token;
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64Url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
