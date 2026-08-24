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

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
    const body = await req.json().catch(() => ({}));
    const nick = String(body.nick || "").trim();
    if (nick.length < 2 || nick.length > 40) return generic();

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const salt = Deno.env.get("LOGIN_RATE_LIMIT_SALT") || Deno.env.get("SUPABASE_URL") || "raindogs";
    const keyHash = await digest(`${salt}:recovery:${forwarded}:${nick.toLocaleLowerCase("tr-TR")}`);
    const { data: allowed } = await admin.rpc("consume_password_recovery_attempt", { p_key_hash: keyHash });
    if (!allowed) return generic();

    const { data: profile } = await admin.from("profiles").select("id,account_status").ilike("nick", nick).maybeSingle();
    if (!profile || !["active", "pending"].includes(profile.account_status)) return generic();
    const { data: record } = await admin.auth.admin.getUserById(profile.id);
    const email = record?.user?.email || "";
    if (!email || email.endsWith("@accounts.raindogs.local")) return generic();

    const redirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT") || "https://berkcerit7669.github.io/RainDogs-app/?password-recovery=1";
    await admin.auth.resetPasswordForEmail(email, { redirectTo });
    return generic();
});
