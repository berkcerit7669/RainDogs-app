import { createClient } from "npm:@supabase/supabase-js@^2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const levels = ["hangaround", "prospect", "member"];
const charterRoles = ["President", "Vice President", "Sgt. at Arms", "Secretary", "Treasurer", "Road Captain", "Tail Gunner"];
const nationalRoles = ["Amir", "National Supervisor", "NVP", "National Sgt. at Arms", "National Secretary", "National Treasurer", "National Road Captain", "National Tail Gunner"];
const nationalGrantors = ["Amir", "NVP", "National Sgt. at Arms", "National Secretary"];

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return reply({ error: "Oturum gerekli." }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Oturum geçersiz." }, 401);
  const { data: actor } = await admin.from("profiles").select("id,account_status,charter_id,charter_role,national_role,is_app_admin").eq("id", authData.user.id).maybeSingle();
  if (!actor || actor.account_status !== "active") return reply({ error: "Yetkisiz işlem." }, 403);
  const isNationalGrantor = actor.is_app_admin || nationalGrantors.includes(actor.national_role || "");
  const isSergeant = actor.charter_role === "Sgt. at Arms" && Boolean(actor.charter_id);
  if (!isNationalGrantor && !isSergeant) return reply({ error: "Başvuru onaylama yetkin yok." }, 403);

  if (req.method === "GET") {
    let query = admin.from("profiles").select("id,nick,full_name,phone,member_level,account_status,charter_id,requested_member_level,requested_charter_role,requested_national_role,created_at,charters(name)").eq("account_status", "pending").order("created_at", { ascending: true });
    if (!isNationalGrantor) query = query.eq("charter_id", actor.charter_id);
    const { data, error } = await query;
    if (error) return reply({ error: "Başvurular alınamadı." }, 500);
    return reply({ applications: data || [], canGrantNational: isNationalGrantor });
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Geçersiz istek." }, 400); }
  const profileId = String(body.profileId || "");
  const action = String(body.action || "");
  const { data: target } = await admin.from("profiles").select("id,nick,charter_id,account_status,requested_member_level,requested_charter_role,requested_national_role").eq("id", profileId).maybeSingle();
  if (!target || target.account_status !== "pending") return reply({ error: "Bekleyen başvuru bulunamadı." }, 404);
  if (!isNationalGrantor && target.charter_id !== actor.charter_id) return reply({ error: "Yalnızca kendi Charter başvurunu yönetebilirsin." }, 403);
  if (action === "reject") {
    const { error } = await admin.from("profiles").update({ account_status: "rejected", approved_by: actor.id, approved_at: new Date().toISOString() }).eq("id", target.id).eq("account_status", "pending");
    if (error) return reply({ error: "Başvuru reddedilemedi." }, 409);
    return reply({ ok: true, status: "rejected" });
  }
  if (action !== "approve") return reply({ error: "Geçersiz karar." }, 400);
  const memberLevel = String(body.memberLevel || target.requested_member_level || "hangaround").toLowerCase();
  const charterRole = String(body.charterRole ?? target.requested_charter_role ?? "");
  const nationalRole = String(body.nationalRole ?? target.requested_national_role ?? "");
  if (!levels.includes(memberLevel)) return reply({ error: "Üyelik statüsü geçersiz." }, 400);
  if (charterRole && !charterRoles.includes(charterRole)) return reply({ error: "Charter görevi geçersiz." }, 400);
  if (nationalRole && (!isNationalGrantor || !nationalRoles.includes(nationalRole))) return reply({ error: "National görev atama yetkin yok." }, 403);
  const update = {
    member_level: memberLevel,
    charter_role: charterRole || null,
    national_role: isNationalGrantor && nationalRole ? nationalRole : null,
    account_status: "active",
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("profiles").update(update).eq("id", target.id).eq("account_status", "pending");
  if (error) return reply({ error: error.code === "23505" ? "Bu görev başka bir üyede kayıtlı." : "Başvuru onaylanamadı." }, 409);
  return reply({ ok: true, status: "active" });
});
