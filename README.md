# Money Tracker

A simple mobile web app for tracking balances with people. Positive balances mean they owe you. Negative balances mean you owe them.

## Sheet setup

Use this header row in `Sheet1`:

```text
id | name | balance | updated_at
```

The app can create the header row automatically after the Google connection works, but adding it yourself makes setup easier to verify.

Balance changes are logged in a separate `Transactions` sheet. The app creates it automatically with this header row and shows the latest three changes on each person's page:

```text
id | person_id | person_name | adjustment | balance_after | note | created_at
```

## Google setup

Google Cloud project:

```text
Project name: Money Tracker
Project ID: money-tracker-501107
```

The Google Sheets API is enabled and the sheet is shared with this service account:

```text
money-tracker-sheets@money-tracker-501107.iam.gserviceaccount.com
```

Create or keep one JSON key for that service account and store the key securely.

Keep the JSON key private. Do not commit it to GitHub.

## Cloudflare secrets

In Cloudflare Pages, add these environment variables:

```text
SHEET_ID=1ifguBUGzKmw2ezoUahTX7ReASJasV28OLqptVuf2nI4
SHEET_NAME=Sheet1
GOOGLE_CLIENT_EMAIL=money-tracker-sheets@money-tracker-501107.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=the private_key value from the JSON key
```

For `GOOGLE_PRIVATE_KEY`, include the full value with `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.

For local development, copy `.dev.vars.example` to `.dev.vars` and replace the placeholder Google values. `.dev.vars` is ignored by Git.

## Deploy

Connect this repository to Cloudflare Pages.

Recommended settings:

```text
Framework preset: None
Build command: blank
Build output directory: /
```

Cloudflare Pages Functions will serve the `/api/people` endpoints automatically.
