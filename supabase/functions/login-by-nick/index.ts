import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@^2";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function publicKey(): string {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    return keys.default ?? Object.values(keys)[0];
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function failure(status = 401) {
  return new Response(JSON.stringify({ error: "Giriş bilgisi veya şifre hatalı ya da üyelik aktif değil." }), {
    status,
    headers: jsonHeaders,
  });
}

async function authUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((user) => String(user.email || "").toLocaleLowerCase("tr-TR") === email.toLocaleLowerCase("tr-TR"));
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function profileByIdentifier(admin: ReturnType<typeof createClient>, identifier: string) {
  if (identifier.includes("@")) {
    const user = await authUserByEmail(admin, identifier);
    if (!user) return null;
    const { data } = await admin.from("profiles").select("id,nick,full_name,member_level,account_status,charter_id,charter_role,national_role,is_app_admin,charters(name)").eq("id", user.id).maybeSingle();
    return data || null;
  }
  const selection = "id,nick,full_name,member_level,account_status,charter_id,charter_role,national_role,is_app_admin,charters(name)";
  const { data: nickRows } = await admin.from("profiles").select(selection).ilike("nick", identifier).limit(2);
  if (nickRows?.length === 1 && !String(identifier).toLocaleLowerCase("tr-TR").startsWith("atanmadı-")) return nickRows[0];
  const { data: nameRows } = await admin.from("profiles").select(selection).ilike("full_name", identifier).limit(2);
  return nameRows?.length === 1 ? nameRows[0] : null;
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });
    }

    let payload: { identifier?: string; nick?: string; password?: string };
    try {
      payload = await req.json();
    } catch {
      return failure(400);
    }

    const identifier = String(payload.identifier ?? payload.nick ?? "").trim();
    const password = String(payload.password ?? "");
    if (identifier.length < 2 || identifier.length > 160 || password.length < 6 || password.length > 128) return failure();

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const salt = Deno.env.get("LOGIN_RATE_LIMIT_SALT") ?? Deno.env.get("SUPABASE_URL") ?? "raindogs";
    const rateKey = await digest(`${salt}:${forwarded}:${identifier.toLocaleLowerCase("tr-TR")}`);
    const { data: allowed, error: rateError } = await ctx.supabaseAdmin.rpc("consume_nick_login_attempt", { p_key_hash: rateKey });
    if (rateError || !allowed) return failure(429);

    const profile = await profileByIdentifier(ctx.supabaseAdmin, identifier);
    if (!profile || !["active", "pending"].includes(profile.account_status)) return failure();

    const { data: authRecord, error: userError } = await ctx.supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = authRecord?.user?.email;
    if (userError || !email) return failure();

    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", publicKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) return failure();

    await ctx.supabaseAdmin.rpc("clear_nick_login_attempts", { p_key_hash: rateKey });
    const charterRelation = Array.isArray(profile.charters) ? profile.charters[0] : profile.charters;
    const responseProfile = { ...profile, charter_name: charterRelation?.name ?? "" };
    delete responseProfile.charters;
    return new Response(JSON.stringify({ session: signedIn.session, profile: responseProfile }), { status: 200, headers: jsonHeaders });
  }),
};
