const HEADERS = ["id", "name", "balance", "updated_at"];

export { HEADERS };

export async function getRows(env, rangeName = "A:D") {
  const data = await sheetsRequest(env, "GET", valuesUrl(env, rangeName));
  return data.values || [];
}

export async function appendRow(env, row) {
  const range = encodeURIComponent(`${sheetName(env)}!A:D`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsRequest(env, "POST", url, { values: [row] });
}

export async function updateRange(env, rangeName, values) {
  const url = valuesUrl(env, rangeName) + "?valueInputOption=USER_ENTERED";
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

function valuesUrl(env, rangeName) {
  const range = encodeURIComponent(`${sheetName(env)}!${rangeName}`);
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
