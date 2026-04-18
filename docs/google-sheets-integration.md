# Googleスプレッドシート連携手順

## 1. スプレッドシートを作成
1. Googleスプレッドシートを新規作成
2. 1行目の見出しを以下にする
   - `勤務日`
   - `開始`
   - `終了`
   - `勤務区分`
   - `従業員ID`
   - `従業員名`
   - `備考`
   - `送信日時`

## 2. Apps Scriptを作成
1. スプレッドシートで `拡張機能 > Apps Script` を開く
2. `Code.gs` を以下に置き換える

```javascript
const SHEET_NAME = "シート1";
const WEBHOOK_TOKEN = "replace-with-your-token";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (!payload || payload.token !== WEBHOOK_TOKEN) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const sentAt = payload.sent_at || new Date().toISOString();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "sheet_not_found" }, 404);
    }

    rows.forEach((row) => {
      sheet.appendRow([
        row.shift_date || "",
        row.start_time || "",
        row.end_time || "",
        row.shift_type || "",
        row.employee_id || "",
        row.employee_name || "",
        row.note || "",
        sentAt
      ]);
    });

    return jsonResponse({ ok: true, inserted: rows.length }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function jsonResponse(obj, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 3. Webアプリとしてデプロイ
1. `デプロイ > 新しいデプロイ`
2. 種類を `ウェブアプリ` に設定
3. 実行するユーザー: `自分`
4. アクセスできるユーザー: `全員`
5. デプロイして `ウェブアプリURL` を控える

## 4. アプリの `.env` を設定
`.env` に以下を追加

```env
EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL=<ウェブアプリURL>
EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_TOKEN=<WEBHOOK_TOKENと同じ値>
```

Vercel本番では、`Project Settings > Environment Variables` にも設定してください。
- `GOOGLE_SHEETS_WEBHOOK_URL`（推奨）
- `GOOGLE_SHEETS_WEBHOOK_TOKEN`（推奨）

`URL` は必ず `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` 形式を使います。
`/dev` や `docs.google.com` のURLは使えません。

## 5. アプリから反映
1. 管理者でログイン
2. `シフト` タブで日付を選択
3. `スプレッドシートへ反映` ボタンを押す
4. シートに行が追記される
