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

  if (!webhookUrl) {
    res.status(500).json({
      ok: false,
      error: "webhook_url_missing",
      hint: "Set GOOGLE_SHEETS_WEBHOOK_URL in Vercel Environment Variables."
    });
    return;
  }

  try {
    const payload =
      req.body && typeof req.body === "object" ? { ...req.body } : {};
    if (webhookToken) {
      payload.token = webhookToken;
    }

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await upstream.text();
    if (!upstream.ok) {
      res.status(502).json({
        ok: false,
        error: "upstream_error",
        status: upstream.status,
        statusText: upstream.statusText,
        body: bodyText
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

