function normalizeWebhookUrl(rawUrl) {
  const value = (rawUrl || "").trim();
  if (!value) {
    return "";
  }

  const macrosMatch = value.match(/https:\/\/script\.google\.com\/macros\/s\/([^/]+)\/(exec|dev)(\?.*)?$/i);
  if (macrosMatch) {
    const deploymentId = macrosMatch[1];
    const query = macrosMatch[3] || "";
    return `https://script.google.com/macros/s/${deploymentId}/exec${query}`;
  }

  const partialMatch = value.match(/https:\/\/script\.google\.com\/macros\/s\/([^/?#]+)/i);
  if (partialMatch) {
    const deploymentId = partialMatch[1];
    return `https://script.google.com/macros/s/${deploymentId}/exec`;
  }

  return value;
}

function isValidAppsScriptExecUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(\?.*)?$/i.test(url);
}

function compactBodyPreview(text) {
  const plain = String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 220);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const webhookUrl =
    process.env.GOOGLE_SHEETS_WEBHOOK_URL ||
    process.env.EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL ||
    "";
  const webhookToken =
    process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN ||
    process.env.EXPO_PUBLIC_GOOGLE_SHEETS_WEBHOOK_TOKEN ||
    "";
  const normalizedWebhookUrl = normalizeWebhookUrl(webhookUrl);

  if (!normalizedWebhookUrl) {
    res.status(500).json({
      ok: false,
      error: "webhook_url_missing",
      hint: "Set GOOGLE_SHEETS_WEBHOOK_URL in Vercel Environment Variables."
    });
    return;
  }

  if (!isValidAppsScriptExecUrl(normalizedWebhookUrl)) {
    res.status(400).json({
      ok: false,
      error: "invalid_webhook_url",
      hint: "Use Apps Script Web App URL: https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
    });
    return;
  }

  try {
    const payload =
      req.body && typeof req.body === "object" ? { ...req.body } : {};
    if (webhookToken) {
      payload.token = webhookToken;
    }

    const upstream = await fetch(normalizedWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await upstream.text();
    if (!upstream.ok) {
      const preview = compactBodyPreview(bodyText);
      const hint =
        upstream.status === 403
          ? "Apps Scriptのデプロイ設定を「実行ユーザー: 自分」「アクセス: 全員」にしてください。URLは /exec を使用します。"
          : "Google Apps ScriptのWebアプリURLと公開設定を確認してください。";
      res.status(502).json({
        ok: false,
        error: "upstream_error",
        status: upstream.status,
        statusText: upstream.statusText,
        preview,
        hint
      });
      return;
    }

    let upstreamJson = null;
    try {
      upstreamJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      upstreamJson = null;
    }

    res.status(200).json({
      ok: true,
      upstream: upstreamJson ?? bodyText
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "proxy_exception",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
