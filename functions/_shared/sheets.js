const HEADERS = ["id", "name", "balance", "updated_at"];
const TRANSACTION_HEADERS = ["id", "person_id", "person_name", "adjustment", "balance_after", "created_at"];

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
    const rows = await getRows(env, "A:F", tabName);
    if (rows[0]?.slice(0, 6).join("|").toLowerCase() !== TRANSACTION_HEADERS.join("|")) {
      await updateRange(env, "A1:F1", [TRANSACTION_HEADERS], tabName);
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
  await updateRange(env, "A1:F1", [TRANSACTION_HEADERS], tabName);
}

export function transactionsSheetName(env) {
  return env.TRANSACTIONS_SHEET_NAME || "Transactions";
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
