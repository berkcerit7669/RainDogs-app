import { withSupabase } from "jsr:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@^2";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
const memberRoles = ["Hangaround", "Prospect", "Member"];
const charterRoles = ["President", "Vice President", "Sgt. at Arms", "Secretary", "Treasurer", "Road Captain", "Tail Gunner"];
const nationalRoles = ["Amir", "National Supervisor", "NVP", "National Sgt. at Arms", "National Secretary", "National Treasurer", "National Road Captain", "National Tail Gunner"];

function publicKey(): string {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) { const keys = JSON.parse(modern); return keys.default ?? Object.values(keys)[0]; }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

function normalizeMemberLevel(role: string): "hangaround" | "prospect" | "member" {
  if (role === "Hangaround") return "hangaround";
  if (role === "Prospect") return "prospect";
  return "member";
}

function fail(error: string, status = 400) {
  return new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return fail("method_not_allowed", 405);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fail("Geçersiz başvuru."); }
    const fullName = String(body.fullName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const charter = String(body.charter ?? "").trim();
    const phone = String(body.phone ?? "").replace(/[^0-9+]/g, "");
    const requestedRole = String(body.requestedRole ?? "").trim();
    const requestedNationalRole = String(body.requestedNationalRole ?? "").trim();
    const noNick = Boolean(body.noNick);
    const suppliedNick = String(body.nick ?? "").trim();
    if (fullName.length < 3 || fullName.length > 100) return fail("İsim soyisim geçerli değil.");
    if (!email.includes("@") || email.length > 160) return fail("Geçerli bir e-posta gir.");
    if (password.length < 8 || password.length > 128) return fail("Şifre en az 8 karakter olmalı.");
    if (phone.length < 10 || phone.length > 16) return fail("Telefon numarası geçerli değil.");
    if (![...memberRoles, ...charterRoles].includes(requestedRole)) return fail("Üyelik statüsü geçerli değil.");
    if (requestedNationalRole && !nationalRoles.includes(requestedNationalRole)) return fail("National görev geçerli değil.");
    if (!noNick && (suppliedNick.length < 2 || suppliedNick.length > 40)) return fail("Nick geçerli değil.");
    const { data: charterRow } = await ctx.supabaseAdmin.from("charters").select("id,name").eq("name", charter).eq("active", true).maybeSingle();
    if (!charterRow) return fail("Charter bulunamadı.");
    const pendingNick = noNick ? `Atanmadı-${crypto.randomUUID().slice(0, 8)}` : suppliedNick;
    const [{ data: duplicateNick }, { data: duplicateName }] = await Promise.all([
      ctx.supabaseAdmin.from("profiles").select("id").ilike("nick", pendingNick).limit(1),
      ctx.supabaseAdmin.from("profiles").select("id").ilike("full_name", fullName).limit(1)
    ]);
    if (duplicateNick?.length || duplicateName?.length) return fail("Bu nick veya isimle daha önce kayıt oluşturulmuş.", 409);
    const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { registration_source: "raindogs_app" } });
    if (createError || !created.user) return fail(createError?.message?.includes("already") ? "Bu e-posta daha önce kullanılmış." : "Hesap oluşturulamadı.", 409);
    const profile = {
      id: created.user.id, nick: pendingNick, full_name: fullName, phone,
      member_level: normalizeMemberLevel(requestedRole), account_status: "pending",
      charter_id: charterRow.id, charter_role: null, national_role: null, is_app_admin: false,
      requested_member_level: normalizeMemberLevel(requestedRole),
      requested_charter_role: charterRoles.includes(requestedRole) ? requestedRole : null,
      requested_national_role: requestedNationalRole || null
    };
    const { error: profileError } = await ctx.supabaseAdmin.from("profiles").insert(profile);
    if (profileError) { await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id); return fail("Başvuru kaydedilemedi.", 409); }
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", publicKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) return fail("Başvuru alındı ancak oturum açılamadı.", 201);
    return new Response(JSON.stringify({ session: signedIn.session, profile: { ...profile, charter_name: charterRow.name } }), { status: 201, headers: jsonHeaders });
  })
};
