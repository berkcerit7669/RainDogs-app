import { withSupabase } from "jsr:@supabase/server@^1";

const H={"Content-Type":"application/json; charset=utf-8"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const NATIONAL_FULL=new Set(["Amir","NVP","National Secretary","National Sgt. at Arms"]);
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
    const [charters,events,announcements,routes,attendance,km,visits,notes,notifications,tickets]=await Promise.all([
      ctx.supabaseAdmin.from("charters").select("id,name,active").eq("active",true),
      ctx.supabaseAdmin.from("events").select("*,charters:owner_charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),owner_charter_id.eq.${own}`).order("starts_at"),
      ctx.supabaseAdmin.from("announcements").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("routes").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("attendance").select("*").or(national?"event_id.not.is.null":`member_id.eq.${actor.id}`),
      ctx.supabaseAdmin.from("km_entries").select("*").or(national?"member_id.not.is.null":`member_id.eq.${actor.id}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("clubhouse_visits").select("*,profiles:member_id(nick),charters:charter_id(name)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("entered_at",{ascending:false}),
      ctx.supabaseAdmin.from("member_notes").select("*").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("notifications").select("*").eq("recipient_id",actor.id).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("help_tickets").select("*").or(actor.is_app_admin?"id.not.is.null":`reporter_id.eq.${actor.id}`).order("created_at",{ascending:false})
    ]);
    const failed=[charters,events,announcements,routes,attendance,km,visits,notes,notifications,tickets].find(x=>x.error);if(failed?.error)return out({error:failed.error.message},500);
    return out({charters:charters.data,events:events.data,announcements:announcements.data,routes:routes.data,attendance:attendance.data,kmEntries:km.data,clubhouseVisits:visits.data,memberNotes:notes.data,notifications:notifications.data,helpTickets:tickets.data});
  }

  if(action==="content.save"){
    const kind=String(body.kind||""),table=kind==="event"?"events":kind==="announcement"?"announcements":kind==="route"?"routes":"";if(!table)return out({error:"Geçersiz içerik."},400);
    const cid=body.data?.owner_charter_id||body.data?.charter_id||actor.charter_id;if(!manages(kind,cid))return out({error:"Bu içerik için yetkin yok."},403);
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
  if(action==="km.submit"){
    const km=Number(body.km);if(!Number.isFinite(km)||km<=0)return out({error:"Geçerli kilometre gir."},400);const {data:item,error}=await ctx.supabaseAdmin.from("km_entries").insert({member_id:actor.id,route_name:String(body.routeName||"Rota"),km,status:"pending",submitted_by:actor.id}).select().single();if(error)return out({error:error.message},400);return out({item});
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
  return out({error:"Bilinmeyen işlem."},404);
})};
