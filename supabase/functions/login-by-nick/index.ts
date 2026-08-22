import { withSupabase } from "npm:@supabase/server@^1";
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
  return new Response(JSON.stringify({ error: "Nick veya şifre hatalı ya da üyelik aktif değil." }), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });
    }

    let payload: { nick?: string; password?: string };
    try {
      payload = await req.json();
    } catch {
      return failure(400);
    }

    const nick = String(payload.nick ?? "").trim();
    const password = String(payload.password ?? "");
    if (nick.length < 2 || nick.length > 40 || password.length < 6 || password.length > 128) return failure();

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const salt = Deno.env.get("LOGIN_RATE_LIMIT_SALT") ?? Deno.env.get("SUPABASE_URL") ?? "raindogs";
    const rateKey = await digest(`${salt}:${forwarded}:${nick.toLocaleLowerCase("tr-TR")}`);
    const { data: allowed, error: rateError } = await ctx.supabaseAdmin.rpc("consume_nick_login_attempt", { p_key_hash: rateKey });
    if (rateError || !allowed) return failure(429);

    const { data: profile } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id,nick,full_name,account_status,charter_id,charter_role,national_role,is_app_admin")
      .ilike("nick", nick)
      .maybeSingle();
    if (!profile || profile.account_status !== "active") return failure();

    const { data: authRecord, error: userError } = await ctx.supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = authRecord?.user?.email;
    if (userError || !email) return failure();

    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", publicKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) return failure();

    await ctx.supabaseAdmin.rpc("clear_nick_login_attempts", { p_key_hash: rateKey });
    return new Response(JSON.stringify({ session: signedIn.session, profile }), { status: 200, headers: jsonHeaders });
  }),
};
