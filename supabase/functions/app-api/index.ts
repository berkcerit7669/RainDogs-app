import { withSupabase } from "jsr:@supabase/server@^1";

const H={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const NATIONAL_FULL=new Set(["Amir","NVP","National Secretary","National Sgt. at Arms"]);
const NATIONAL_DIRECT_PUBLISH=new Set(["Amir","NVP","National Secretary"]);
const LOCAL_CONTENT:{[key:string]:Set<string>}={
  event:new Set(["President","Vice President","Sgt. at Arms","Road Captain","Tail Gunner"]),
  announcement:new Set(["President","Vice President","Sgt. at Arms","Secretary","Road Captain","Tail Gunner"]),
  route:new Set(["President","Vice President","Sgt. at Arms","Road Captain","Tail Gunner"])
};

export default {fetch:withSupabase({auth:"publishable"},async(req,ctx)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...H,"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type"}});
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return out({error:"Oturum gerekli."},401);
  const {data:auth}=await ctx.supabaseAdmin.auth.getUser(token);if(!auth.user)return out({error:"Oturum geçersiz."},401);
  const {data:actor,error:actorErr}=await ctx.supabaseAdmin.from("profiles").select("id,nick,account_status,charter_id,charter_role,national_role,is_app_admin").eq("id",auth.user.id).maybeSingle();
  if(actorErr||!actor||actor.account_status!=="active")return out({error:"Aktif üyelik gerekli."},403);
  const body=req.method==="GET"?{}:await req.json().catch(()=>({}));
  const url=new URL(req.url),action=url.searchParams.get("action")||body.action||"bootstrap";
  const national=!!actor.is_app_admin||!!actor.national_role;
  const fullNational=!!actor.is_app_admin||NATIONAL_FULL.has(actor.national_role||"");
  const manages=(kind:string,cid:string|null)=>fullNational||(cid===actor.charter_id&&LOCAL_CONTENT[kind]?.has(actor.charter_role||""));
  const audit=async(actionName:string,targetType:string,targetId:string,detail:unknown={})=>{await ctx.supabaseAdmin.from("admin_logs").insert({actor_id:actor.id,action:actionName,target_type:targetType,target_id:targetId,detail})};

  if(action==="bootstrap"){
    const own=actor.charter_id;
    const management=national||!!actor.charter_role;
    const [charters,events,announcements,routes,attendance,km,visits,notes,notifications,tickets,profiles,applications,logs,clubhouseStates]=await Promise.all([
      ctx.supabaseAdmin.from("charters").select("id,name,active").eq("active",true),
      ctx.supabaseAdmin.from("events").select("*,charters:owner_charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),owner_charter_id.eq.${own}`).order("starts_at"),
      ctx.supabaseAdmin.from("announcements").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("routes").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("attendance").select("*").or(management?"event_id.not.is.null":`member_id.eq.${actor.id}`),
      ctx.supabaseAdmin.from("km_entries").select("*").or(national?"member_id.not.is.null":`member_id.eq.${actor.id}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("clubhouse_visits").select("*,profiles:member_id(nick),charters:charter_id(name)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("entered_at",{ascending:false}),
      management?ctx.supabaseAdmin.from("member_notes").select("*").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
      ctx.supabaseAdmin.from("notifications").select("*").eq("recipient_id",actor.id).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("help_tickets").select("*").or(actor.is_app_admin?"id.not.is.null":`reporter_id.eq.${actor.id}`).order("created_at",{ascending:false}),
      management?ctx.supabaseAdmin.from("profiles").select("id,nick,full_name,phone,motorcycle,member_level,account_status,charter_id,charter_role,national_role,is_app_admin,created_at,charters:charter_id(name)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("nick"):Promise.resolve({data:[],error:null}),
      management?ctx.supabaseAdmin.from("profiles").select("id,nick,full_name,phone,motorcycle,member_level,account_status,charter_id,requested_member_level,requested_charter_role,requested_national_role,created_at,charters:charter_id(name)").eq("account_status","pending").or(fullNational?"id.not.is.null":`charter_id.eq.${own}`).order("created_at"):Promise.resolve({data:[],error:null}),
      national?ctx.supabaseAdmin.from("admin_logs").select("*,profiles:actor_id(nick)").order("created_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}),
      ctx.supabaseAdmin.from("clubhouse_states").select("*").or(national?"charter_id.not.is.null":`charter_id.eq.${own}`)
    ]);
    const failed=[charters,events,announcements,routes,attendance,km,visits,notes,notifications,tickets,profiles,applications,logs,clubhouseStates].find(x=>x.error);if(failed?.error)return out({error:failed.error.message},500);
    const visibleEventIds=new Set((events.data||[]).map((event:any)=>event.id));
    const visibleAttendance=national?(attendance.data||[]):management?(attendance.data||[]).filter((row:any)=>visibleEventIds.has(row.event_id)):(attendance.data||[]);
    return out({actor,charters:charters.data,events:events.data,announcements:announcements.data,routes:routes.data,attendance:visibleAttendance,kmEntries:km.data,clubhouseVisits:visits.data,memberNotes:notes.data,notifications:notifications.data,helpTickets:tickets.data,profiles:profiles.data,applications:applications.data,adminLogs:logs.data,clubhouseStates:clubhouseStates.data});
  }

  if(action==="content.save"){
    const kind=String(body.kind||""),table=kind==="event"?"events":kind==="announcement"?"announcements":kind==="route"?"routes":"";if(!table)return out({error:"Geçersiz içerik."},400);
    const cid=body.data?.owner_charter_id||body.data?.charter_id||actor.charter_id;if(!manages(kind,cid))return out({error:"Bu içerik için yetkin yok."},403);
    if(body.data?.scope==="national"&&!NATIONAL_DIRECT_PUBLISH.has(actor.national_role||""))return out({error:"Türkiye geneli içerik Amir, NVP veya National Secretary onayı gerektirir."},403);
    const data={...body.data,created_by:body.data?.created_by||actor.id,updated_at:new Date().toISOString()};
    const query=body.id?ctx.supabaseAdmin.from(table).update(data).eq("id",body.id):ctx.supabaseAdmin.from(table).insert(data);const {data:saved,error}=await query.select().single();if(error)return out({error:error.message},400);await audit(body.id?"İçerik düzenlendi":"İçerik oluşturuldu",kind,saved.id,{title:saved.title||saved.name});return out({item:saved});
  }
  if(action==="content.archive"){
    const kind=String(body.kind||""),table=kind==="event"?"events":kind==="announcement"?"announcements":kind==="route"?"routes":"";if(!table)return out({error:"Geçersiz içerik."},400);
    const {data:item}=await ctx.supabaseAdmin.from(table).select("*").eq("id",body.id).maybeSingle();const cid=item?.owner_charter_id||item?.charter_id;if(!item||!manages(kind,cid))return out({error:"Yetkisiz işlem."},403);
    const {error}=await ctx.supabaseAdmin.from(table).update({status:body.restore?"active":"archived",updated_at:new Date().toISOString()}).eq("id",body.id);if(error)return out({error:error.message},400);await audit(body.restore?"Arşivden çıkarıldı":"Arşivlendi",kind,body.id);return out({ok:true});
  }
  if(action==="clubhouse.enter"){
    const {data:open}=await ctx.supabaseAdmin.from("clubhouse_visits").select("id").eq("member_id",actor.id).is("exited_at",null).maybeSingle();if(open)return out({error:"Zaten içeride görünüyorsun."},409);
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").insert({charter_id:actor.charter_id,member_id:actor.id,guest_count:Math.max(0,Math.min(20,Number(body.guestCount||0)))}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="clubhouse.leave"){
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").update({exited_at:new Date().toISOString(),closed_by:actor.id}).eq("member_id",actor.id).is("exited_at",null).select().maybeSingle();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="clubhouse.status"){
    const requestedCharter=body.charterId||actor.charter_id;
    if(!fullNational&&!(actor.charter_role&&requestedCharter===actor.charter_id))return out({error:"Kulüp evi durumunu yalnızca yönetim değiştirebilir."},403);
    const charterId=body.charterId||actor.charter_id,status=String(body.status||"available");if(!["available","busy"].includes(status))return out({error:"Geçersiz durum."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_states").upsert({charter_id:charterId,status,note:String(body.note||""),updated_by:actor.id,updated_at:new Date().toISOString()},{onConflict:"charter_id"}).select().single();if(error)return out({error:error.message},400);await audit("Kulüp evi durumu güncellendi","clubhouse",charterId,{status});return out({item});
  }
  if(action==="km.submit"){
    const km=Number(body.km);if(!Number.isFinite(km)||km<=0)return out({error:"Geçerli kilometre gir."},400);const {data:item,error}=await ctx.supabaseAdmin.from("km_entries").insert({member_id:actor.id,route_name:String(body.routeName||"Rota"),km,status:"pending",submitted_by:actor.id}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="km.approve"){
    const {data:item}=await ctx.supabaseAdmin.from("km_entries").select("*,profiles:member_id(charter_id)").eq("id",body.id).maybeSingle();if(!item||(!fullNational&&item.profiles?.charter_id!==actor.charter_id))return out({error:"Yetkisiz işlem."},403);
    const {data:saved,error}=await ctx.supabaseAdmin.from("km_entries").update({status:body.approve===false?"rejected":"active",approved_by:actor.id}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);await audit(body.approve===false?"Kilometre reddedildi":"Kilometre onaylandı","km",body.id,{km:item.km});return out({item:saved});
  }
  if(action==="attendance.set"){
    const {data:event}=await ctx.supabaseAdmin.from("events").select("owner_charter_id").eq("id",body.eventId).maybeSingle();if(!event||!manages("event",event.owner_charter_id))return out({error:"Yoklama yönetimi yetkin yok."},403);
    const status=String(body.status||"waiting");if(!["waiting","attended","absent","excused"].includes(status))return out({error:"Geçersiz yoklama durumu."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("attendance").upsert({event_id:body.eventId,member_id:body.memberId,status,marked_by:actor.id,marked_at:new Date().toISOString()},{onConflict:"event_id,member_id"}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="attendance.finalize"){
    const {data:event}=await ctx.supabaseAdmin.from("events").select("owner_charter_id").eq("id",body.eventId).maybeSingle();if(!event||!manages("event",event.owner_charter_id))return out({error:"Yetkisiz işlem."},403);const {data,error}=await ctx.supabaseAdmin.rpc("finalize_event_attendance",{p_event_id:body.eventId});if(error)return out({error:error.message},400);return out({credited:data});
  }
  if(action==="notification.read"||action==="notification.delete"){
    const query=action.endsWith("delete")?ctx.supabaseAdmin.from("notifications").delete():ctx.supabaseAdmin.from("notifications").update({read_at:new Date().toISOString()});
    const {error}=await query.eq("id",body.id).eq("recipient_id",actor.id);if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="notification.clear"){
    const {error}=await ctx.supabaseAdmin.from("notifications").delete().eq("recipient_id",actor.id);if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="ticket.create"){
    const subject=String(body.subject||"").trim(),text=String(body.body||"").trim();if(!subject||!text)return out({error:"Başlık ve açıklama zorunlu."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("help_tickets").insert({reporter_id:actor.id,subject,body:text,status:"Yeni"}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="ticket.reply"){
    if(!actor.is_app_admin)return out({error:"Yalnızca uygulama admini yanıtlayabilir."},403);const status=String(body.status||"Yanıtlandı");const {data:item,error}=await ctx.supabaseAdmin.from("help_tickets").update({admin_reply:String(body.reply||""),status,updated_at:new Date().toISOString()}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="note.create"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("id,charter_id").eq("id",body.memberId).maybeSingle();if(!target||(!national&&target.charter_id!==actor.charter_id))return out({error:"Bu üye için not yetkin yok."},403);if(!national&&!actor.charter_role)return out({error:"Yönetim yetkisi gerekli."},403);
    const {data:item,error}=await ctx.supabaseAdmin.from("member_notes").insert({member_id:target.id,charter_id:target.charter_id,note_type:String(body.noteType||"Genel"),body:String(body.body||""),created_by:actor.id}).select().single();if(error)return out({error:error.message},400);await audit("Üye notu eklendi","profile",target.id);return out({item});
  }
  if(action==="member.update"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("*").eq("id",body.memberId).maybeSingle();if(!target)return out({error:"Üye bulunamadı."},404);
    const sameCharter=target.charter_id===actor.charter_id,localManager=!!actor.charter_role&&sameCharter;
    if(!fullNational&&!actor.is_app_admin&&!localManager)return out({error:"Bu üyeyi düzenleme yetkin yok."},403);
    if(localManager&&!fullNational&&!actor.is_app_admin&&(target.is_app_admin||target.national_role))return out({error:"Charter yönetimi National veya uygulama yöneticisi hesabını değiştiremez."},403);
    const patch:any={updated_at:new Date().toISOString()};
    if(body.accountStatus){const allowed=actor.is_app_admin||fullNational||["President","Vice President","Secretary","Sgt. at Arms"].includes(actor.charter_role||"");if(!allowed)return out({error:"Üyelik durumu yetkin yok."},403);patch.account_status=body.accountStatus}
    if(body.memberLevel)patch.member_level=body.memberLevel;
    if(body.charterRole!==undefined){if(!actor.is_app_admin&&!fullNational&&!["President","Vice President"].includes(actor.charter_role||""))return out({error:"Charter görevi atama yetkin yok."},403);patch.charter_role=body.charterRole||null}
    if(body.nationalRole!==undefined||body.isAppAdmin!==undefined){if(!actor.is_app_admin&&!NATIONAL_FULL.has(actor.national_role||""))return out({error:"National görev atama yetkin yok."},403);if(body.nationalRole!==undefined)patch.national_role=body.nationalRole||null;if(body.isAppAdmin!==undefined){if(!actor.is_app_admin)return out({error:"Uygulama admini atamasını yalnızca uygulama admini yapabilir."},403);patch.is_app_admin=!!body.isAppAdmin}}
    const {data:item,error}=await ctx.supabaseAdmin.from("profiles").update(patch).eq("id",target.id).select().single();if(error)return out({error:error.message},400);await audit("Üye bilgisi güncellendi","profile",target.id,patch);return out({item});
  }
  if(action==="application.decide"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("*").eq("id",body.memberId).eq("account_status","pending").maybeSingle();if(!target)return out({error:"Bekleyen başvuru bulunamadı."},404);
    const reviewer=actor.is_app_admin||fullNational||(actor.charter_role==="Sgt. at Arms"&&actor.charter_id===target.charter_id);if(!reviewer)return out({error:"Başvuru onaylama yetkin yok."},403);
    const approved=body.approve!==false,patch=approved?{account_status:"active",member_level:target.requested_member_level||target.member_level,charter_role:target.requested_charter_role||target.charter_role,national_role:fullNational?(target.requested_national_role||target.national_role):target.national_role,approved_by:actor.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{account_status:"rejected",approved_by:actor.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {data:item,error}=await ctx.supabaseAdmin.from("profiles").update(patch).eq("id",target.id).select().single();if(error)return out({error:error.message},400);await audit(approved?"Üyelik onaylandı":"Üyelik reddedildi","profile",target.id);return out({item});
  }
  if(action==="charter.create"){
    if(!actor.is_app_admin&&!fullNational)return out({error:"Charter ekleme yetkin yok."},403);const name=String(body.name||"").trim();if(!name)return out({error:"Charter adı zorunlu."},400);const {data:item,error}=await ctx.supabaseAdmin.from("charters").insert({name}).select().single();if(error)return out({error:error.message},400);await audit("Charter oluşturuldu","charter",item.id,{name});return out({item});
  }
  return out({error:"Bilinmeyen işlem."},404);
})};
