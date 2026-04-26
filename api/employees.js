const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const PROFILE_COLUMNS =
  "id, role, name, employee_code, phone, department, status";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function toNullableText(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }
  return value.trim();
}

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : fallback;
}

function getSupabaseUrl() {
  return getEnv("SUPABASE_URL") || getEnv("EXPO_PUBLIC_SUPABASE_URL");
}

function getServiceRoleKey() {
  return (
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SECRET_KEY") ||
    getEnv("SUPABASE_SERVICE_KEY")
  );
}

function getAnonKey() {
  return getEnv("SUPABASE_ANON_KEY") || getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

function getReadToken() {
  return getEnv("APP_READ_TOKEN") || getEnv("EXPO_PUBLIC_APP_READ_TOKEN");
}

function getWriteToken() {
  return getEnv("APP_WRITE_TOKEN") || getEnv("EXPO_PUBLIC_APP_WRITE_TOKEN");
}

function hasHeaderToken(req, headerName, expectedToken) {
  if (!expectedToken) {
    return true;
  }
  const raw = req.headers[headerName];
  const actual = Array.isArray(raw) ? raw[0] : raw;
  return typeof actual === "string" && actual === expectedToken;
}

function buildClient() {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  const anonKey = getAnonKey();
  const key = serviceKey || anonKey;
  if (!url || !key) {
    return { client: null, error: "service_role_missing" };
  }
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return { client, error: null, isPrivileged: Boolean(serviceKey) };
}

function isProfilesFkError(message) {
  const text = String(message || "");
  return (
    text.includes("profiles_id_fkey") ||
    text.includes("foreign key") ||
    text.includes("auth.users")
  );
}

async function insertEmployeeProfile(client, payload, isPrivileged) {
  const baseRow = {
    role: "employee",
    name: payload.name.trim(),
    employee_code: toNullableText(payload.employeeCode),
    phone: toNullableText(payload.phone),
    department: toNullableText(payload.department),
    status: "active"
  };

  const directInsert = await client
    .from("profiles")
    .upsert(
      {
        id: crypto.randomUUID(),
        ...baseRow
      },
      { onConflict: "id" }
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (!directInsert.error) {
    return { employee: directInsert.data, error: null };
  }

  if (!isProfilesFkError(directInsert.error.message)) {
    return { employee: null, error: directInsert.error.message };
  }

  if (!isPrivileged) {
    return {
      employee: null,
      error: "profiles_fk_requires_service_role_key"
    };
  }

  const syntheticEmail = `employee-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@local.shift`;
  const syntheticPassword = crypto.randomBytes(18).toString("base64url");
  const createdAuthUser = await client.auth.admin.createUser({
    email: syntheticEmail,
    password: syntheticPassword,
    email_confirm: true
  });

  if (createdAuthUser.error || !createdAuthUser.data?.user?.id) {
    return {
      employee: null,
      error:
        createdAuthUser.error?.message ||
        "failed_to_create_auth_user_for_profile_insert"
    };
  }

  const retryInsert = await client
    .from("profiles")
    .upsert(
      {
        id: createdAuthUser.data.user.id,
        ...baseRow
      },
      { onConflict: "id" }
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (retryInsert.error) {
    return { employee: null, error: retryInsert.error.message };
  }
  return { employee: retryInsert.data, error: null };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const readAllowed = hasHeaderToken(req, "x-app-token", getReadToken());
  const writeAllowed = hasHeaderToken(req, "x-app-write-token", getWriteToken());

  if (req.method === "GET" && !readAllowed) {
    res.status(401).json({
      ok: false,
      error: "unauthorized_read_token"
    });
    return;
  }

  if ((req.method === "POST" || req.method === "DELETE") && !writeAllowed) {
    res.status(401).json({
      ok: false,
      error: "unauthorized_write_token"
    });
    return;
  }

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const { client, error: clientError, isPrivileged } = buildClient();
  if (!client) {
    res.status(500).json({
      ok: false,
      error: clientError,
      message:
        "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (and SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL) in Vercel."
    });
    return;
  }

  try {
    if (req.method === "GET") {
      const rows = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("role", "employee")
        .order("name", { ascending: true });

      if (rows.error) {
        res.status(400).json({ ok: false, error: rows.error.message });
        return;
      }

      res.status(200).json({
        ok: true,
        employees: Array.isArray(rows.data) ? rows.data : []
      });
      return;
    }

    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        res.status(400).json({
          ok: false,
          error: "name_required",
          message: "name is required"
        });
        return;
      }

      const created = await insertEmployeeProfile(client, body, Boolean(isPrivileged));
      if (created.error || !created.employee) {
        res.status(400).json({
          ok: false,
          error: created.error || "employee_create_failed"
        });
        return;
      }

      res.status(200).json({
        ok: true,
        employee: created.employee
      });
      return;
    }

    const id =
      (typeof req.query?.id === "string" && req.query.id.trim()) ||
      (typeof req.body?.id === "string" && req.body.id.trim()) ||
      "";
    if (!id) {
      res.status(400).json({
        ok: false,
        error: "id_required"
      });
      return;
    }

    const deleted = await client.from("profiles").delete().eq("id", id);
    if (deleted.error) {
      res.status(400).json({ ok: false, error: deleted.error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "employees_api_exception",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
