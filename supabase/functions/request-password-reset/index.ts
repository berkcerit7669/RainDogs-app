import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const generic = () => new Response(JSON.stringify({ ok: true, message: "Hesap uygunsa şifre yenileme bağlantısı e-posta adresine gönderildi." }), { status: 200, headers });

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function authUserByEmail(email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((user) => String(user.email || "").toLocaleLowerCase("tr-TR") === email.toLocaleLowerCase("tr-TR"));
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function profileByIdentifier(identifier: string) {
  if (identifier.includes("@")) {
    const user = await authUserByEmail(identifier);
    if (!user) return null;
    const { data } = await admin.from("profiles").select("id,account_status").eq("id", user.id).maybeSingle();
    return data || null;
  }
  const { data: nickRows } = await admin.from("profiles").select("id,account_status").ilike("nick", identifier).limit(2);
  if (nickRows?.length === 1 && !String(identifier).toLocaleLowerCase("tr-TR").startsWith("atanmadı-")) return nickRows[0];
  const { data: nameRows } = await admin.from("profiles").select("id,account_status").ilike("full_name", identifier).limit(2);
  return nameRows?.length === 1 ? nameRows[0] : null;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || body.nick || "").trim();
    if (identifier.length < 2 || identifier.length > 160) return generic();

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const salt = Deno.env.get("LOGIN_RATE_LIMIT_SALT") || Deno.env.get("SUPABASE_URL") || "raindogs";
    const keyHash = await digest(`${salt}:recovery:${forwarded}:${identifier.toLocaleLowerCase("tr-TR")}`);
    const { data: allowed } = await admin.rpc("consume_password_recovery_attempt", { p_key_hash: keyHash });
    if (!allowed) return generic();

    const profile = await profileByIdentifier(identifier);
    if (!profile || !["active", "pending"].includes(profile.account_status)) return generic();
    const { data: record } = await admin.auth.admin.getUserById(profile.id);
    const email = record?.user?.email || "";
    if (!email || email.endsWith("@accounts.raindogs.local")) return generic();

    const redirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT") || "https://berkcerit7669.github.io/RainDogs-app/?password-recovery=1";
    await admin.auth.resetPasswordForEmail(email, { redirectTo });
    return generic();
});
