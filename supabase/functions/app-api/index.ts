import { withSupabase } from "jsr:@supabase/server@^1";
import webpush from "npm:web-push@3.6.7";

const H={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const NATIONAL_FULL=new Set(["Amir","NVP","National Secretary","National Sgt. at Arms"]);
const NATIONAL_DIRECT_PUBLISH=new Set(["Amir","NVP","National Secretary"]);
const LEVEL_RANK:{[key:string]:number}={hangaround:0,prospect:1,member:2};
const MANUAL_BADGES=new Set(["Iron Butt","Iron Rider","Nomad","Lone Dog","Dogometer","Road King","Night Dog","Border Stray","Asphalt Scars","Grease & Blood"]);
const LOCAL_CONTENT:{[key:string]:Set<string>}={
  event:new Set(["President","Vice President","Sgt. at Arms","Road Captain","Tail Gunner"]),
  announcement:new Set(["President","Vice President","Sgt. at Arms","Secretary","Road Captain","Tail Gunner"]),
  route:new Set(["President","Vice President","Sgt. at Arms","Road Captain","Tail Gunner"])
};
const cleanContent=(kind:string,input:any)=>kind==="event"?{
  title:String(input?.title||"").trim(),description:String(input?.description||""),scope:input?.scope||"charter",owner_charter_id:input?.owner_charter_id||null,starts_at:input?.starts_at,ends_at:input?.ends_at||null,location:String(input?.location||""),route_text:String(input?.route_text||""),distance_km:Number(input?.distance_km||0),importance:String(input?.importance||"Normal"),participation_status:String(input?.participation_status||"Açık"),status:input?.status||"active",poster_path:input?.poster_path||null
}:kind==="announcement"?{
  title:String(input?.title||"").trim(),body:String(input?.body||""),scope:input?.scope||"charter",charter_id:input?.charter_id||null,importance:String(input?.importance||"Normal"),required_read:!!input?.required_read,status:input?.status||"active",photo_path:input?.photo_path||null,expires_at:input?.expires_at||null
}:{
  name:String(input?.name||"").trim(),scope:input?.scope||"charter",charter_id:input?.charter_id||null,distance_km:Number(input?.distance_km||0),difficulty:String(input?.difficulty||"Orta"),duration:String(input?.duration||""),surface:String(input?.surface||""),character:String(input?.character||""),notes:String(input?.notes||""),photo_path:input?.photo_path||null,status:input?.status||"active"
};

export default {fetch:withSupabase({auth:"publishable"},async(req,ctx)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...H,"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type"}});
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return out({error:"Oturum gerekli."},401);
  const {data:auth}=await ctx.supabaseAdmin.auth.getUser(token);if(!auth.user)return out({error:"Oturum geçersiz."},401);
  const {data:actor,error:actorErr}=await ctx.supabaseAdmin.from("profiles").select("id,nick,account_status,charter_id,charter_role,national_role,is_app_admin,member_level").eq("id",auth.user.id).maybeSingle();
  if(actorErr||!actor||actor.account_status!=="active")return out({error:"Aktif üyelik gerekli."},403);
  const body=req.method==="GET"?{}:await req.json().catch(()=>({}));
  const url=new URL(req.url),action=url.searchParams.get("action")||body.action||"bootstrap";
  const national=!!actor.is_app_admin||!!actor.national_role;
  const fullNational=!!actor.is_app_admin||NATIONAL_FULL.has(actor.national_role||"");
  const boardMember=national||actor.charter_role==="President";
  const manages=(kind:string,cid:string|null)=>fullNational||(cid===actor.charter_id&&LOCAL_CONTENT[kind]?.has(actor.charter_role||""));
  const canFinance=national||["President","Vice President","Treasurer"].includes(actor.charter_role||"");
  const canDiscipline=national||["President","Vice President","Sgt. at Arms"].includes(actor.charter_role||"");
  const audit=async(actionName:string,targetType:string,targetId:string,detail:unknown={})=>{await ctx.supabaseAdmin.from("admin_logs").insert({actor_id:actor.id,action:actionName,target_type:targetType,target_id:targetId,detail})};
  const notify=async(input:any|any[])=>{
    const rows=Array.isArray(input)?input:[input];if(!rows.length)return;
    await ctx.supabaseAdmin.from("notifications").insert(rows);
    const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY"),vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY");if(!vapidPublic||!vapidPrivate)return;
    const recipientIds=[...new Set(rows.map((x:any)=>x.recipient_id).filter(Boolean))];if(!recipientIds.length)return;
    const {data:subscriptions}=await ctx.supabaseAdmin.from("push_subscriptions").select("id,member_id,endpoint,p256dh,auth").in("member_id",recipientIds);
    if(!subscriptions?.length)return;
    webpush.setVapidDetails("mailto:admin@raindogs.app",vapidPublic,vapidPrivate);
    const byRecipient=new Map(rows.map((x:any)=>[x.recipient_id,x]));
    await Promise.allSettled(subscriptions.map(async(sub:any)=>{const n:any=byRecipient.get(sub.member_id);if(!n)return;try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:n.title||"RainDogs",body:n.body||"Yeni bildirimin var.",tag:`raindogs-${n.type||"notification"}`,url:`./?screen=${encodeURIComponent(n.action_path||"notifications")}`}))}catch(error:any){if([404,410].includes(Number(error?.statusCode)))await ctx.supabaseAdmin.from("push_subscriptions").delete().eq("id",sub.id)}}));
  };

  if(action==="bootstrap"){
    const own=actor.charter_id;
    const management=national||!!actor.charter_role;
    const [charters,events,eventCharters,announcements,routes,attendance,km,visits,notes,notifications,tickets,profiles,applications,logs,clubhouseStates,announcementReads,eventResponses,emergency,finance,discipline,polls,pollVotes,approvalRequests,kmTotals,cultureItems,milestones,roleHistory,memberBadges,attendanceAll,readsAll,requiredAnnouncements,eventReads]=await Promise.all([
      ctx.supabaseAdmin.from("charters").select("id,name,active").eq("active",true),
      ctx.supabaseAdmin.from("events").select("*,charters:owner_charter_id(name)").order("starts_at"),
      ctx.supabaseAdmin.from("event_charters").select("event_id,charter_id,approval_status"),
      ctx.supabaseAdmin.from("announcements").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("routes").select("*,charters:charter_id(name)").or(national?"id.not.is.null":`scope.in.(national,joint),charter_id.eq.${own}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("attendance").select("*,profiles:member_id(nick,charter_id)").or(management?"event_id.not.is.null":`member_id.eq.${actor.id}`),
      ctx.supabaseAdmin.from("km_entries").select("*,profiles:member_id(nick,charter_id)").or(management?"member_id.not.is.null":`member_id.eq.${actor.id}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("clubhouse_visits").select("*,profiles:member_id(nick),charters:charter_id(name)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("entered_at",{ascending:false}),
      management?ctx.supabaseAdmin.from("member_notes").select("*,member:member_id(nick),creator:created_by(nick)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
      ctx.supabaseAdmin.from("notifications").select("*").eq("recipient_id",actor.id).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("help_tickets").select("*").or(actor.is_app_admin?"id.not.is.null":`reporter_id.eq.${actor.id}`).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("profiles").select("id,nick,full_name,phone,motorcycle,license_class,avatar_path,member_level,account_status,charter_id,charter_role,national_role,is_app_admin,birthday,created_at,charters:charter_id(name)").or(`account_status.eq.active,id.eq.${actor.id}`).order("nick"),
      management?ctx.supabaseAdmin.from("profiles").select("id,nick,full_name,phone,motorcycle,member_level,account_status,charter_id,requested_member_level,requested_charter_role,requested_national_role,created_at,charters:charter_id(name)").eq("account_status","pending").or(fullNational?"id.not.is.null":`charter_id.eq.${own}`).order("created_at"):Promise.resolve({data:[],error:null}),
      national?ctx.supabaseAdmin.from("admin_logs").select("*,profiles:actor_id(nick)").order("created_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}),
      ctx.supabaseAdmin.from("clubhouse_states").select("*").or(national?"charter_id.not.is.null":`charter_id.eq.${own}`)
      ,ctx.supabaseAdmin.from("announcement_reads").select("*").eq("member_id",actor.id)
      ,ctx.supabaseAdmin.from("event_responses").select("*,profiles:member_id(nick,charter_id)").or(management?"event_id.not.is.null":`member_id.eq.${actor.id}`)
      ,ctx.supabaseAdmin.from("emergency_profiles").select("*").or(management?"member_id.not.is.null":`member_id.eq.${actor.id}`)
      ,canFinance?ctx.supabaseAdmin.from("charter_finance").select("*,charters:charter_id(name),profiles:created_by(nick)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null})
      ,canDiscipline?ctx.supabaseAdmin.from("charter_discipline").select("*,charters:charter_id(name),member:member_id(nick),creator:created_by(nick)").or(national?"id.not.is.null":`charter_id.eq.${own}`).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null})
      ,boardMember?ctx.supabaseAdmin.from("board_polls").select("*").order("created_at",{ascending:false}):Promise.resolve({data:[],error:null})
      ,boardMember?ctx.supabaseAdmin.from("board_poll_votes").select("*"):Promise.resolve({data:[],error:null})
      ,management?ctx.supabaseAdmin.from("approval_requests").select("*,submitter:submitted_by(nick),decider:decided_by(nick),source:source_charter_id(name),target:target_charter_id(name)").order("created_at",{ascending:false}):Promise.resolve({data:[],error:null})
      ,ctx.supabaseAdmin.from("km_entries").select("member_id,km").eq("status","active")
      ,ctx.supabaseAdmin.from("culture_items").select("*").order("position").order("created_at")
      ,ctx.supabaseAdmin.from("membership_milestones").select("member_id,milestone,occurred_on")
      ,ctx.supabaseAdmin.from("role_history").select("id,member_id,role_scope,role_name,started_at,ended_at").order("started_at")
      ,ctx.supabaseAdmin.from("member_badges").select("*,profiles:member_id(nick)").order("awarded_at",{ascending:false})
      ,ctx.supabaseAdmin.from("attendance").select("member_id,status")
      ,ctx.supabaseAdmin.from("announcement_reads").select("member_id,announcement_id")
      ,ctx.supabaseAdmin.from("announcements").select("id,charter_id,scope,created_at").eq("required_read",true)
      ,ctx.supabaseAdmin.from("event_reads").select("event_id,member_id").or(management?"event_id.not.is.null":`member_id.eq.${actor.id}`)
    ]);
    const ticketIds=(tickets.data||[]).map((x:any)=>x.id),ticketMessages=ticketIds.length?await ctx.supabaseAdmin.from("help_ticket_messages").select("*,profiles:sender_id(nick,is_app_admin)").in("ticket_id",ticketIds).order("created_at"):({data:[],error:null});
    const failed=[charters,events,eventCharters,announcements,routes,attendance,km,visits,notes,notifications,tickets,profiles,applications,logs,clubhouseStates,announcementReads,eventResponses,emergency,finance,discipline,polls,pollVotes,approvalRequests,ticketMessages,kmTotals,cultureItems,milestones,roleHistory,memberBadges,attendanceAll,readsAll,requiredAnnouncements,eventReads].find(x=>x.error);if(failed?.error)return out({error:failed.error.message},500);
    const kmByMember=new Map<string,number>();(kmTotals.data||[]).forEach((row:any)=>kmByMember.set(row.member_id,(kmByMember.get(row.member_id)||0)+Number(row.km||0)));
    (profiles.data||[]).forEach((p:any)=>p.total_km=kmByMember.get(p.id)||0);
    const attRate=new Map<string,{a:number,t:number}>();
    (attendanceAll.data||[]).forEach((r:any)=>{if(!["attended","absent"].includes(r.status))return;const e=attRate.get(r.member_id)||{a:0,t:0};e.t++;if(r.status==="attended")e.a++;attRate.set(r.member_id,e)});
    const readSet=new Set((readsAll.data||[]).map((r:any)=>`${r.member_id}:${r.announcement_id}`));
    const requiredList=requiredAnnouncements.data||[];
    const eventReadSet=new Set((eventReads.data||[]).map((r:any)=>`${r.member_id}:${r.event_id}`));
    const eventsWithAttendance=new Set((attendance.data||[]).map((a:any)=>a.event_id));
    const finalizedEventIds=new Set((attendance.data||[]).filter((a:any)=>a.finalized).map((a:any)=>a.event_id));
    const pastEvents=(events.data||[]).filter((e:any)=>e.status==="active"&&e.starts_at&&new Date(e.starts_at)<=new Date());
    (profiles.data||[]).forEach((p:any)=>{
      const att=attRate.get(p.id);p.attendance_rate=att&&att.t?Math.round(att.a/att.t*100):null;
      const applicable=requiredList.filter((a:any)=>new Date(a.created_at)>=new Date(p.created_at)&&(a.scope==="national"||a.charter_id===p.charter_id));
      const eventsApplicable=pastEvents.filter((e:any)=>new Date(e.starts_at)>=new Date(p.created_at)&&(e.scope==="national"||e.owner_charter_id===p.charter_id));
      const eventsRead=eventsApplicable.filter((e:any)=>eventsWithAttendance.has(e.id)?finalizedEventIds.has(e.id)&&eventReadSet.has(`${p.id}:${e.id}`):eventReadSet.has(`${p.id}:${e.id}`));
      const combinedApplicable=applicable.length+eventsApplicable.length,combinedRead=applicable.filter((a:any)=>readSet.has(`${p.id}:${a.id}`)).length+eventsRead.length;
      p.read_rate=combinedApplicable?Math.round(combinedRead/combinedApplicable*100):null;
    });
    const approvedJointIds=new Set((eventCharters.data||[]).filter((row:any)=>row.charter_id===own&&row.approval_status==="active").map((row:any)=>row.event_id));
    const visibleEvents=national?(events.data||[]):(events.data||[]).filter((event:any)=>event.scope==="national"||event.owner_charter_id===own||(event.scope==="joint"&&approvedJointIds.has(event.id)));
    const visibleEventIds=new Set(visibleEvents.map((event:any)=>event.id));
    const visibleAttendance=national?(attendance.data||[]):management?(attendance.data||[]).filter((row:any)=>visibleEventIds.has(row.event_id)):(attendance.data||[]);
    const visibleKm=national?(km.data||[]):management?(km.data||[]).filter((row:any)=>row.profiles?.charter_id===own):(km.data||[]);
    const visibleResponses=national?(eventResponses.data||[]):(eventResponses.data||[]).filter((row:any)=>visibleEventIds.has(row.event_id));
    const signGroups:{[bucket:string]:{row:any,field:string,path:string}[]}={"content-media":[],"profile-photos":[],"support-screenshots":[]};
    const queueSign=(bucket:string,row:any,field:string,path:string|null)=>{if(!path){row[field]=null;return}signGroups[bucket].push({row,field,path})};
    visibleEvents.forEach((x:any)=>queueSign("content-media",x,"poster_url",x.poster_path));
    (announcements.data||[]).forEach((x:any)=>queueSign("content-media",x,"photo_url",x.photo_path));
    (routes.data||[]).forEach((x:any)=>queueSign("content-media",x,"photo_url",x.photo_path));
    (profiles.data||[]).forEach((x:any)=>queueSign("profile-photos",x,"avatar_url",x.avatar_path));
    (tickets.data||[]).forEach((x:any)=>queueSign("support-screenshots",x,"screenshot_url",x.screenshot_path));
    await Promise.all(Object.entries(signGroups).filter(([,items])=>items.length).map(async([bucket,items])=>{
      const {data}=await ctx.supabaseAdmin.storage.from(bucket).createSignedUrls(items.map(i=>i.path),3600);
      items.forEach((item,i)=>{item.row[item.field]=data?.[i]?.signedUrl||null});
    }));
    const visibleApprovals=(approvalRequests.data||[]).filter((request:any)=>national||request.submitted_by===actor.id||request.source_charter_id===own||request.target_charter_id===own);
    const visibleEventCharters=national?(eventCharters.data||[]):(eventCharters.data||[]).filter((row:any)=>visibleEventIds.has(row.event_id));
    const deletionQuery=actor.is_app_admin?ctx.supabaseAdmin.from("account_deletion_requests").select("*,profiles:member_id(nick,full_name)").order("created_at",{ascending:false}):ctx.supabaseAdmin.from("account_deletion_requests").select("*").eq("member_id",actor.id).order("created_at",{ascending:false}).limit(1);
    const deletionRequests=await deletionQuery;
    if(deletionRequests.error)return out({error:deletionRequests.error.message},500);
    const ownDeletionRequest=actor.is_app_admin?(deletionRequests.data||[]).find((x:any)=>x.member_id===actor.id)||null:(deletionRequests.data||[])[0]||null;
    if(actor.national_role==="National Road Captain"){
      const now=new Date();
      const pendingNationalEvents=(events.data||[]).filter((e:any)=>!e.owner_charter_id&&e.status==="active"&&e.starts_at&&new Date(e.starts_at)<now&&!(attendance.data||[]).some((a:any)=>a.event_id===e.id&&a.finalized));
      if(pendingNationalEvents.length){
        const {data:sentLogs}=await ctx.supabaseAdmin.from("admin_logs").select("target_id").eq("action","Yoklama hatırlatması gönderildi").eq("actor_id",actor.id).in("target_id",pendingNationalEvents.map((e:any)=>e.id));
        const already=new Set((sentLogs||[]).map((r:any)=>r.target_id));
        const toNotify=pendingNationalEvents.filter((e:any)=>!already.has(e.id));
        if(toNotify.length){
          await notify(toNotify.map((e:any)=>({recipient_id:actor.id,type:"Yoklama",title:"Yoklama kapatılmayı bekliyor",body:`${e.title} etkinliğinin yoklaması hâlâ kapatılmadı.`,action_path:`events:national:${e.id}`})));
          await ctx.supabaseAdmin.from("admin_logs").insert(toNotify.map((e:any)=>({actor_id:actor.id,action:"Yoklama hatırlatması gönderildi",target_type:"event",target_id:e.id,detail:{title:e.title}})));
        }
      }
    }
    return out({actor,charters:charters.data,events:visibleEvents,eventCharters:visibleEventCharters,announcements:announcements.data,routes:routes.data,attendance:visibleAttendance,kmEntries:visibleKm,clubhouseVisits:visits.data,memberNotes:notes.data,notifications:notifications.data,helpTickets:tickets.data,profiles:profiles.data,applications:applications.data,adminLogs:logs.data,clubhouseStates:clubhouseStates.data,announcementReads:announcementReads.data,eventResponses:visibleResponses,emergencyProfiles:emergency.data,charterFinance:finance.data,charterDiscipline:discipline.data,boardPolls:polls.data,boardPollVotes:pollVotes.data,approvalRequests:visibleApprovals,helpTicketMessages:ticketMessages.data,accountDeletionRequest:ownDeletionRequest,accountDeletionRequests:actor.is_app_admin?deletionRequests.data:[],cultureItems:cultureItems.data,milestones:milestones.data,roleHistory:roleHistory.data,memberBadges:memberBadges.data,eventReads:eventReads.data});
  }

  if(action==="announcement.read"){
    const {data:announcement}=await ctx.supabaseAdmin.from("announcements").select("id,scope,charter_id,status").eq("id",body.announcementId).maybeSingle();
    if(!announcement||announcement.status!=="active"||(!national&&announcement.scope==="charter"&&announcement.charter_id!==actor.charter_id))return out({error:"Duyuruya erişim yok."},403);
    const {error}=await ctx.supabaseAdmin.from("announcement_reads").upsert({announcement_id:body.announcementId,member_id:actor.id,read_at:new Date().toISOString()},{onConflict:"announcement_id,member_id"});
    if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="event.respond"){
    const response=String(body.response||"");if(!["yes","maybe","no"].includes(response))return out({error:"Geçersiz katılım durumu."},400);
    const {data:event}=await ctx.supabaseAdmin.from("events").select("id,scope,owner_charter_id,status,participation_status").eq("id",body.eventId).maybeSingle();
    const jointVisible=event?.scope!=="joint"||national||event.owner_charter_id===actor.charter_id||!!(await ctx.supabaseAdmin.from("event_charters").select("event_id").eq("event_id",body.eventId).eq("charter_id",actor.charter_id).eq("approval_status","active").maybeSingle()).data;
    if(!event||event.status!=="active"||(!national&&event.scope==="charter"&&event.owner_charter_id!==actor.charter_id)||!jointVisible)return out({error:"Etkinliğe erişim yok."},403);
    if(!["Açık","open","Katılıma Açık"].includes(event.participation_status||""))return out({error:"Etkinlik katılıma açık değil."},409);
    const {data:item,error}=await ctx.supabaseAdmin.from("event_responses").upsert({event_id:body.eventId,member_id:actor.id,response,responded_at:new Date().toISOString()},{onConflict:"event_id,member_id"}).select().single();
    if(error)return out({error:error.message},400);
    await ctx.supabaseAdmin.from("event_reads").upsert({event_id:body.eventId,member_id:actor.id},{onConflict:"event_id,member_id",ignoreDuplicates:true});
    return out({item});
  }
  if(action==="event.markRead"){
    const {data:event}=await ctx.supabaseAdmin.from("events").select("id,participation_status,status").eq("id",body.eventId).maybeSingle();if(!event)return out({error:"Etkinlik bulunamadı."},404);
    if(["Açık","open","Katılıma Açık"].includes(event.participation_status||"")&&event.status==="active")return out({ok:true,skipped:true});
    const {error}=await ctx.supabaseAdmin.from("event_reads").upsert({event_id:body.eventId,member_id:actor.id},{onConflict:"event_id,member_id",ignoreDuplicates:true});if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="emergency.save"){
    const data={member_id:actor.id,blood_group:String(body.bloodGroup||""),contact_name:String(body.contactName||"").trim(),contact_phone:String(body.contactPhone||"").replace(/\D/g,""),medical_notes:String(body.medicalNotes||"").trim(),updated_at:new Date().toISOString()};
    if(!data.blood_group||!data.contact_name||data.contact_phone.length<10)return out({error:"Kan grubu, acil kişi ve geçerli telefon zorunlu."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("emergency_profiles").upsert(data,{onConflict:"member_id"}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="finance.save"||action==="finance.delete"){
    const charterId=body.charterId||actor.charter_id,allowed=national||(charterId===actor.charter_id&&["President","Vice President","Treasurer"].includes(actor.charter_role||""));if(!allowed)return out({error:"Finans kaydı yetkin yok."},403);
    if(action.endsWith("delete")){const {error}=await ctx.supabaseAdmin.from("charter_finance").delete().eq("id",body.id).eq("charter_id",charterId);if(error)return out({error:error.message},400);await audit("Finans kaydı silindi","finance",body.id);return out({ok:true})}
    const data={charter_id:charterId,entry_type:String(body.entryType||"Gelir"),amount:Number(body.amount),note:String(body.note||""),created_by:actor.id,updated_at:new Date().toISOString()};if(!Number.isFinite(data.amount)||data.amount<=0)return out({error:"Geçerli tutar gir."},400);
    const query=body.id?ctx.supabaseAdmin.from("charter_finance").update({entry_type:data.entry_type,amount:data.amount,note:data.note,updated_at:data.updated_at}).eq("id",body.id).eq("charter_id",charterId):ctx.supabaseAdmin.from("charter_finance").insert(data);const {data:item,error}=await query.select().single();if(error)return out({error:error.message},400);await audit(body.id?"Finans kaydı düzenlendi":"Finans kaydı eklendi","finance",item.id);return out({item});
  }
  if(action==="discipline.save"||action==="discipline.delete"){
    const charterId=body.charterId||actor.charter_id,allowed=national||(charterId===actor.charter_id&&["President","Vice President","Sgt. at Arms"].includes(actor.charter_role||""));if(!allowed)return out({error:"Disiplin kaydı yetkin yok."},403);
    if(action.endsWith("delete")){const {error}=await ctx.supabaseAdmin.from("charter_discipline").delete().eq("id",body.id).eq("charter_id",charterId);if(error)return out({error:error.message},400);await audit("Disiplin kaydı silindi","discipline",body.id);return out({ok:true})}
    const data={charter_id:charterId,member_id:body.memberId,body:String(body.body||"").trim(),created_by:actor.id,updated_at:new Date().toISOString()};if(!data.member_id||!data.body)return out({error:"Üye ve not zorunlu."},400);
    const query=body.id?ctx.supabaseAdmin.from("charter_discipline").update({body:data.body,updated_at:data.updated_at}).eq("id",body.id).eq("charter_id",charterId):ctx.supabaseAdmin.from("charter_discipline").insert(data);const {data:item,error}=await query.select().single();if(error)return out({error:error.message},400);await audit(body.id?"Disiplin kaydı düzenlendi":"Disiplin kaydı eklendi","discipline",item.id);return out({item});
  }
  if(action==="board.create"){
    if(!boardMember)return out({error:"Kurul üyeliği gerekli."},403);
    const title=String(body.title||"").trim(),question=String(body.question||"").trim(),options=Array.isArray(body.options)?body.options.map((x:any)=>String(x||"").trim()).filter(Boolean):["Evet","Hayır","Çekimser"];
    if(!title||!question)return out({error:"Başlık ve soru zorunlu."},400);if(options.length<2)return out({error:"En az iki seçenek gerekli."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("board_polls").insert({title,question,options,closes_at:body.closesAt||null,created_by:actor.id}).select().single();if(error)return out({error:error.message},400);
    const {data:boardMembers}=await ctx.supabaseAdmin.from("profiles").select("id").eq("account_status","active").neq("id",actor.id).or("national_role.not.is.null,is_app_admin.eq.true,charter_role.eq.President");
    if(boardMembers?.length)await notify(boardMembers.map((m:any)=>({recipient_id:m.id,type:"Kurul",title:"Yeni kurul oylaması",body:title,action_path:"boardPolls"})));
    await audit("Kurul oylaması oluşturuldu","board_poll",item.id,{title});return out({item});
  }
  if(action==="board.close"){
    if(!boardMember)return out({error:"Kurul üyeliği gerekli."},403);
    const {data:item,error}=await ctx.supabaseAdmin.from("board_polls").update({status:body.reopen?"Açık":"Kapalı",updated_at:new Date().toISOString()}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);
    await audit(body.reopen?"Kurul oylaması yeniden açıldı":"Kurul oylaması kapatıldı","board_poll",body.id);return out({item});
  }
  if(action==="board.delete"){
    if(!boardMember)return out({error:"Kurul üyeliği gerekli."},403);
    const {error}=await ctx.supabaseAdmin.from("board_polls").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Kurul oylaması silindi","board_poll",body.id);return out({ok:true});
  }
  if(action==="board.vote"){
    if(!boardMember)return out({error:"Kurul üyeliği gerekli."},403);const {data:poll}=await ctx.supabaseAdmin.from("board_polls").select("options,status,closes_at").eq("id",body.pollId).maybeSingle();if(!poll||poll.status!=="Açık"||(poll.closes_at&&new Date(poll.closes_at)<=new Date()))return out({error:"Oylama kapalı."},409);
    const option=String(body.option||"");if(!(poll.options||[]).includes(option))return out({error:"Geçersiz seçenek."},400);const {error}=await ctx.supabaseAdmin.from("board_poll_votes").upsert({poll_id:body.pollId,member_id:actor.id,option_value:option,voted_at:new Date().toISOString()},{onConflict:"poll_id,member_id"});if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="archive.upload"){
    const canUpload=actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");if(!canUpload)return out({error:"Arşive belge yükleme yetkin yok."},403);
    const title=String(body.title||"").trim();if(!title)return out({error:"Belge başlığı zorunlu."},400);
    const boardOnly=!!body.boardOnly;
    const minLevel=["hangaround","member"].includes(body.minMemberLevel)?body.minMemberLevel:"hangaround";
    const match=String(body.dataUrl||"").match(/^data:application\/pdf;base64,(.+)$/);if(!match)return out({error:"Yalnızca PDF dosyası yüklenebilir."},400);
    const bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));if(bytes.byteLength>20971520)return out({error:"Dosya 20 MB'tan küçük olmalı."},413);
    const path=`${actor.id}/${crypto.randomUUID()}.pdf`;
    const {error:upErr}=await ctx.supabaseAdmin.storage.from("archive-docs").upload(path,bytes,{contentType:"application/pdf",upsert:false});if(upErr)return out({error:upErr.message},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("archive_documents").insert({title,description:String(body.description||"").trim(),storage_path:path,min_member_level:boardOnly?"member":minLevel,board_only:boardOnly,created_by:actor.id}).select().single();if(error)return out({error:error.message},400);
    await audit("Arşiv belgesi yüklendi","archive_document",item.id,{title});return out({item});
  }
  if(action==="archive.update"){
    const canEdit=actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");if(!canEdit)return out({error:"Arşiv belgesi düzenleme yetkin yok."},403);
    const title=String(body.title||"").trim();if(!title)return out({error:"Belge başlığı zorunlu."},400);
    const boardOnly=!!body.boardOnly;
    const minLevel=["hangaround","member"].includes(body.minMemberLevel)?body.minMemberLevel:"hangaround";
    const {data:item,error}=await ctx.supabaseAdmin.from("archive_documents").update({title,description:String(body.description||"").trim(),min_member_level:boardOnly?"member":minLevel,board_only:boardOnly}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);
    await audit("Arşiv belgesi düzenlendi","archive_document",body.id,{title});return out({item});
  }
  if(action==="archive.list"){
    const {data,error}=await ctx.supabaseAdmin.from("archive_documents").select("*,profiles:created_by(nick)").order("created_at",{ascending:false});if(error)return out({error:error.message},500);
    const myRank=LEVEL_RANK[actor.member_level||"hangaround"]??0;
    const visible=(data||[]).filter((d:any)=>actor.is_app_admin||(d.board_only?boardMember:(LEVEL_RANK[d.min_member_level]??0)<=myRank));
    await Promise.all(visible.map(async(d:any)=>{const {data:signed}=await ctx.supabaseAdmin.storage.from("archive-docs").createSignedUrl(d.storage_path,300);d.url=signed?.signedUrl||null}));
    return out({items:visible});
  }
  if(action==="archive.delete"){
    const canDelete=actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");if(!canDelete)return out({error:"Arşiv belgesi silme yetkin yok."},403);
    const {data:doc}=await ctx.supabaseAdmin.from("archive_documents").select("storage_path").eq("id",body.id).maybeSingle();if(!doc)return out({error:"Belge bulunamadı."},404);
    await ctx.supabaseAdmin.storage.from("archive-docs").remove([doc.storage_path]);
    const {error}=await ctx.supabaseAdmin.from("archive_documents").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Arşiv belgesi silindi","archive_document",body.id);return out({ok:true});
  }
  if(action==="media.upload"){
    const purpose=String(body.purpose||"content"),match=String(body.dataUrl||"").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return out({error:"Geçersiz görsel."},400);const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),limit=purpose==="avatar"?5242880:10485760;if(bytes.byteLength>limit)return out({error:"Görsel dosyası çok büyük."},413);
    const bucket=purpose==="avatar"?"profile-photos":purpose==="support"?"support-screenshots":"content-media",ext=match[1].split("/")[1].replace("jpeg","jpg"),path=`${actor.id}/${crypto.randomUUID()}.${ext}`;const {error}=await ctx.supabaseAdmin.storage.from(bucket).upload(path,bytes,{contentType:match[1],upsert:false});if(error)return out({error:error.message},400);const {data:url}=await ctx.supabaseAdmin.storage.from(bucket).createSignedUrl(path,3600);return out({path,url:url?.signedUrl||null});
  }

  if(action==="approval.submit"){
    const requestType=String(body.requestType||""),kind=String(body.kind||"");if(!["national_content","joint_event"].includes(requestType)||!["event","announcement","route"].includes(kind))return out({error:"Geçersiz onay talebi."},400);
    if(requestType==="joint_event"&&kind!=="event")return out({error:"Ortak Charter talebi yalnızca etkinlik için kullanılabilir."},400);
    const sourceCharterId=body.sourceCharterId||actor.charter_id,targetCharterId=body.targetCharterId||null;if(!sourceCharterId||!manages(kind,sourceCharterId))return out({error:"Talebi gönderme yetkin yok."},403);
    if(requestType==="joint_event"&&(!targetCharterId||targetCharterId===sourceCharterId))return out({error:"Farklı bir hedef Charter seç."},400);
    if(requestType==="national_content"&&!national)return out({error:"Türkiye geneli yayın talebini yalnızca National görevli gönderebilir."},403);
    const payload=cleanContent(kind,body.data);if(!(payload as any).title&&!(payload as any).name)return out({error:"İçerik başlığı zorunlu."},400);
    (payload as any).scope=requestType==="joint_event"?"joint":"national";(payload as any)[kind==="event"?"owner_charter_id":"charter_id"]=sourceCharterId;
    const {data:item,error}=await ctx.supabaseAdmin.from("approval_requests").insert({request_type:requestType,content_kind:kind,payload,source_charter_id:sourceCharterId,target_charter_id:targetCharterId,status:"pending",submitted_by:actor.id}).select().single();if(error)return out({error:error.message},400);
    let recipients=ctx.supabaseAdmin.from("profiles").select("id,national_role,is_app_admin,charter_role").eq("account_status","active").neq("id",actor.id);if(requestType==="joint_event")recipients=recipients.eq("charter_id",targetCharterId).not("charter_role","is",null);const {data:reviewerRows}=await recipients;const reviewers=(reviewerRows||[]).filter((x:any)=>requestType==="joint_event"||x.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(x.national_role||""));if(reviewers.length)await notify(reviewers.map((x:any)=>({recipient_id:x.id,type:"Onay",title:(payload as any).title||(payload as any).name,body:requestType==="joint_event"?`${actor.nick} ortak etkinlik daveti gönderdi.`:`${actor.nick} Türkiye geneli yayın onayı istiyor.`,action_path:requestType==="joint_event"?"charterApprovals":"nationalPublishApprovals"})));
    await audit("Onay talebi gönderildi","approval_request",item.id,{requestType,kind});return out({item});
  }
  if(action==="approval.decide"){
    const {data:request}=await ctx.supabaseAdmin.from("approval_requests").select("*").eq("id",body.id).eq("status","pending").maybeSingle();if(!request)return out({error:"Bekleyen talep bulunamadı."},404);
    const nationalApprover=!!actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");const jointApprover=request.target_charter_id===actor.charter_id&&!!actor.charter_role;
    if(request.request_type==="national_content"&&!nationalApprover)return out({error:"Türkiye geneli yayın onayı yetkin yok."},403);if(request.request_type==="joint_event"&&!fullNational&&!jointApprover)return out({error:"Ortak etkinlik onayı yetkin yok."},403);
    if(request.request_type==="national_content"&&actor.national_role==="National Secretary"&&request.submitted_by===actor.id)return out({error:"Kendi yayın talebini Amir veya NVP onaylamalı."},403);
    const approved=body.approve!==false;let publishedId:string|null=null;if(approved){const table=request.content_kind==="event"?"events":request.content_kind==="announcement"?"announcements":"routes",data={...cleanContent(request.content_kind,request.payload),created_by:request.submitted_by,updated_at:new Date().toISOString()};const {data:saved,error}=await ctx.supabaseAdmin.from(table).insert(data).select().single();if(error)return out({error:error.message},400);publishedId=saved.id;if(request.request_type==="joint_event")await ctx.supabaseAdmin.from("event_charters").upsert([{event_id:saved.id,charter_id:request.source_charter_id,approval_status:"active"},{event_id:saved.id,charter_id:request.target_charter_id,approval_status:"active"}],{onConflict:"event_id,charter_id"})}
    const {data:item,error}=await ctx.supabaseAdmin.from("approval_requests").update({status:approved?"approved":"rejected",decided_by:actor.id,decided_at:new Date().toISOString()}).eq("id",request.id).select().single();if(error)return out({error:error.message},400);
    const publishedTitle=(request.payload as any).title||(request.payload as any).name,publishedPath=publishedId?(request.content_kind==="event"?"events":request.content_kind==="announcement"?"news":"routes"):"approvals";
    await notify({recipient_id:request.submitted_by,type:"Onay",title:publishedTitle,body:approved?"Talep onaylandı ve yayınlandı.":"Talep reddedildi.",action_path:publishedPath});
    if(approved&&publishedId){
      const contentType=request.content_kind==="event"?"Etkinlik":request.content_kind==="announcement"?"Duyuru":"Rota";
      let recipients=ctx.supabaseAdmin.from("profiles").select("id").eq("account_status","active").neq("id",request.submitted_by);
      if(request.request_type==="joint_event")recipients=recipients.in("charter_id",[request.source_charter_id,request.target_charter_id].filter(Boolean));
      const {data:members}=await recipients;
      if(members?.length)await notify(members.map((m:any)=>({recipient_id:m.id,type:contentType,title:publishedTitle,body:request.request_type==="joint_event"?"Yeni ortak etkinlik yayınlandı.":"Yeni Türkiye geneli içerik yayınlandı.",action_path:publishedPath})));
    }
    await audit(approved?"Talep onaylandı":"Talep reddedildi","approval_request",request.id,{publishedId});return out({item,publishedId});
  }
  if(action==="approval.delete"){
    const {data:request}=await ctx.supabaseAdmin.from("approval_requests").select("*").eq("id",body.id).eq("status","pending").maybeSingle();if(!request)return out({error:"Bekleyen talep bulunamadı."},404);
    const own=request.submitted_by===actor.id;
    const nationalApprover=!!actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");const jointApprover=request.target_charter_id===actor.charter_id&&!!actor.charter_role;
    const canManage=request.request_type==="national_content"?nationalApprover:(fullNational||jointApprover);
    if(!own&&!canManage)return out({error:"Yetkisiz işlem."},403);
    const {error}=await ctx.supabaseAdmin.from("approval_requests").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Onay talebi silindi","approval_request",body.id,{requestType:request.request_type,kind:request.content_kind});return out({ok:true});
  }
  if(action==="approval.update"){
    const {data:request}=await ctx.supabaseAdmin.from("approval_requests").select("*").eq("id",body.id).eq("status","pending").maybeSingle();if(!request)return out({error:"Bekleyen talep bulunamadı."},404);
    const own=request.submitted_by===actor.id;
    const nationalApprover=!!actor.is_app_admin||NATIONAL_DIRECT_PUBLISH.has(actor.national_role||"");const jointApprover=request.target_charter_id===actor.charter_id&&!!actor.charter_role;
    const canManage=request.request_type==="national_content"?nationalApprover:(fullNational||jointApprover);
    if(!own&&!canManage)return out({error:"Yetkisiz işlem."},403);
    const payload=cleanContent(request.content_kind,body.data);if(!(payload as any).title&&!(payload as any).name)return out({error:"İçerik başlığı zorunlu."},400);
    (payload as any).scope=request.payload.scope;(payload as any)[request.content_kind==="event"?"owner_charter_id":"charter_id"]=request.source_charter_id;
    const {data:item,error}=await ctx.supabaseAdmin.from("approval_requests").update({payload}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);
    await audit("Onay talebi düzenlendi","approval_request",body.id,{requestType:request.request_type,kind:request.content_kind});return out({item});
  }

  if(action==="content.save"){
    const kind=String(body.kind||""),table=kind==="event"?"events":kind==="announcement"?"announcements":kind==="route"?"routes":"";if(!table)return out({error:"Geçersiz içerik."},400);
    let cid=body.data?.owner_charter_id||body.data?.charter_id||null;if(!cid&&body.id){const {data:existing}=await ctx.supabaseAdmin.from(table).select("owner_charter_id,charter_id").eq("id",body.id).maybeSingle();cid=existing?.owner_charter_id||existing?.charter_id||null}if(!manages(kind,cid))return out({error:"Bu içerik için yetkin yok."},403);
    if(body.data?.scope==="national"&&!actor.is_app_admin&&!NATIONAL_DIRECT_PUBLISH.has(actor.national_role||""))return out({error:"Türkiye geneli içerik Amir, NVP veya National Secretary onayı gerektirir."},403);
    const clean=cleanContent(kind,body.data);
    const contentTitle=kind==="route"?(clean as any).name:(clean as any).title;
    if(!String(contentTitle||"").trim())return out({error:kind==="route"?"Rota adı zorunlu.":"İçerik başlığı zorunlu."},400);
    const data=body.id?{...clean,updated_at:new Date().toISOString()}:{...clean,created_by:actor.id,updated_at:new Date().toISOString()};
    const query=body.id?ctx.supabaseAdmin.from(table).update(data).eq("id",body.id):ctx.supabaseAdmin.from(table).insert(data);const {data:saved,error}=await query.select().single();if(error)return out({error:error.message},400);await audit(body.id?"İçerik düzenlendi":"İçerik oluşturuldu",kind,saved.id,{title:saved.title||saved.name});
    if(kind==="event"&&saved.scope==="joint"&&Array.isArray(body.partnerCharterIds)){const charterIds=[saved.owner_charter_id,...body.partnerCharterIds].filter(Boolean);if(charterIds.length)await ctx.supabaseAdmin.from("event_charters").upsert(charterIds.map((charterId:string)=>({event_id:saved.id,charter_id:charterId,approval_status:"active"})),{onConflict:"event_id,charter_id"})}
    if(!body.id){const scope=saved.scope,contentCharter=saved.owner_charter_id||saved.charter_id;let recipients=ctx.supabaseAdmin.from("profiles").select("id").eq("account_status","active").neq("id",actor.id);if(scope==="charter")recipients=recipients.eq("charter_id",contentCharter);if(scope==="joint"&&Array.isArray(body.partnerCharterIds))recipients=recipients.in("charter_id",[contentCharter,...body.partnerCharterIds].filter(Boolean));const {data:members}=await recipients;const title=saved.title||saved.name,type=kind==="event"?"Etkinlik":kind==="announcement"?"Duyuru":"Rota",basePath=kind==="event"?"events":kind==="announcement"?"news":"routes",path=`${basePath}:${scope==="national"?"national":"charter"}`;if(members?.length)await notify(members.map((m:any)=>({recipient_id:m.id,type,title,body:kind==="event"?"Yeni etkinlik yayınlandı.":kind==="announcement"?"Yeni duyuru yayınlandı.":"Yeni rota yayınlandı.",action_path:path})))}return out({item:saved});
  }
  if(action==="content.archive"){
    const kind=String(body.kind||""),table=kind==="event"?"events":kind==="announcement"?"announcements":kind==="route"?"routes":"";if(!table)return out({error:"Geçersiz içerik."},400);
    const {data:item}=await ctx.supabaseAdmin.from(table).select("*").eq("id",body.id).maybeSingle();const cid=item?.owner_charter_id||item?.charter_id;if(!item||!manages(kind,cid))return out({error:"Yetkisiz işlem."},403);
    const {error}=await ctx.supabaseAdmin.from(table).update({status:body.restore?"active":"archived",updated_at:new Date().toISOString()}).eq("id",body.id);if(error)return out({error:error.message},400);await audit(body.restore?"Arşivden çıkarıldı":"Arşivlendi",kind,body.id);return out({ok:true});
  }
  if(action==="clubhouse.enter"){
    const {data:state}=await ctx.supabaseAdmin.from("clubhouse_states").select("status").eq("charter_id",actor.charter_id).maybeSingle();if(state?.status==="busy")return out({error:"Kulüp evi yönetim tarafından meşgule alındı."},409);
    const {data:open}=await ctx.supabaseAdmin.from("clubhouse_visits").select("id").eq("member_id",actor.id).is("exited_at",null).maybeSingle();if(open)return out({error:"Zaten içeride görünüyorsun."},409);
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").insert({charter_id:actor.charter_id,member_id:actor.id,guest_count:Math.max(0,Math.min(20,Number(body.guestCount||0)))}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="clubhouse.leave"){
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").update({exited_at:new Date().toISOString(),closed_by:actor.id}).eq("member_id",actor.id).is("exited_at",null).select().maybeSingle();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="clubhouse.guests"){
    const guests=Math.max(0,Math.min(20,Number(body.guestCount||0)));const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").update({guest_count:guests}).eq("member_id",actor.id).is("exited_at",null).select().maybeSingle();if(error)return out({error:error.message},400);if(!item)return out({error:"Açık kulüp evi girişin bulunamadı."},404);return out({item});
  }
  if(action==="clubhouse.close"||action==="clubhouse.remind"){
    const {data:visit}=await ctx.supabaseAdmin.from("clubhouse_visits").select("*,profiles:member_id(nick)").eq("id",body.id).is("exited_at",null).maybeSingle();if(!visit)return out({error:"Açık ziyaret kaydı bulunamadı."},404);if(!fullNational&&!(actor.charter_role&&visit.charter_id===actor.charter_id))return out({error:"Bu ziyaret için yönetim yetkin yok."},403);
    if(action.endsWith("remind")){await notify({recipient_id:visit.member_id,type:"Kulüp Evi",title:"Çıkış kaydını kontrol et",body:"Kulüp evi girişin hâlâ açık. Konaklıyorsan işlem yapmana gerek yok.",action_path:"charterHub"});return out({ok:true})}
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_visits").update({exited_at:new Date().toISOString(),closed_by:actor.id}).eq("id",visit.id).select().single();if(error)return out({error:error.message},400);await audit("Kulüp evi çıkışı düzeltildi","clubhouse_visit",visit.id,{member:visit.profiles?.nick});return out({item});
  }
  if(action==="clubhouse.status"){
    const requestedCharter=body.charterId||actor.charter_id,status=String(body.status||"available");
    if(!["available","busy"].includes(status))return out({error:"Geçersiz durum."},400);
    const isManager=fullNational||(actor.charter_role&&requestedCharter===actor.charter_id);
    if(status==="busy"){if(!isManager&&requestedCharter!==actor.charter_id)return out({error:"Yalnızca kendi Charter'ının kulüp evini meşgule alabilirsin."},403)}
    else if(!isManager)return out({error:"Kulüp evini yalnızca yönetim tekrar müsait yapabilir."},403);
    const charterId=requestedCharter;
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_states").upsert({charter_id:charterId,status,note:String(body.note||""),updated_by:actor.id,updated_at:new Date().toISOString()},{onConflict:"charter_id"}).select().single();if(error)return out({error:error.message},400);await audit("Kulüp evi durumu güncellendi","clubhouse",charterId,{status});return out({item});
  }
  if(action==="clubhouse.panic"){
    if(!actor.charter_id)return out({error:"Charter bilgin bulunamadı."},400);
    const {data:open}=await ctx.supabaseAdmin.from("clubhouse_visits").select("id").eq("member_id",actor.id).is("exited_at",null).maybeSingle();
    if(!open){const {error:visitErr}=await ctx.supabaseAdmin.from("clubhouse_visits").insert({charter_id:actor.charter_id,member_id:actor.id,guest_count:0});if(visitErr)return out({error:visitErr.message},400)}
    const {data:item,error}=await ctx.supabaseAdmin.from("clubhouse_states").upsert({charter_id:actor.charter_id,status:"busy",note:"🚨 Red Light",updated_by:actor.id,updated_at:new Date().toISOString()},{onConflict:"charter_id"}).select().single();
    if(error)return out({error:error.message},400);
    await audit("Kulüp evi Red Light","clubhouse",actor.charter_id);
    return out({item});
  }
  if(action==="km.submit"){
    const km=Number(body.km);if(!Number.isFinite(km)||km<=0)return out({error:"Geçerli kilometre gir."},400);const {data:item,error}=await ctx.supabaseAdmin.from("km_entries").insert({member_id:actor.id,route_name:String(body.routeName||"Rota"),km,status:"pending",submitted_by:actor.id}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="km.update"){
    const {data:item}=await ctx.supabaseAdmin.from("km_entries").select("*,profiles:member_id(charter_id)").eq("id",body.id).maybeSingle();if(!item)return out({error:"Kayıt bulunamadı."},404);
    const own=item.member_id===actor.id,manager=fullNational||item.profiles?.charter_id===actor.charter_id;
    if(!own&&!manager)return out({error:"Yetkisiz işlem."},403);
    if(item.status!=="pending")return out({error:"Yalnızca onay bekleyen kayıt düzenlenebilir."},400);
    const km=Number(body.km);if(!Number.isFinite(km)||km<=0)return out({error:"Geçerli kilometre gir."},400);
    const {data:saved,error}=await ctx.supabaseAdmin.from("km_entries").update({route_name:String(body.routeName||item.route_name),km}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);
    await audit("Kilometre talebi düzenlendi","km",body.id,{km});return out({item:saved});
  }
  if(action==="km.approve"){
    const {data:item}=await ctx.supabaseAdmin.from("km_entries").select("*,profiles:member_id(charter_id)").eq("id",body.id).maybeSingle();if(!item||(!fullNational&&item.profiles?.charter_id!==actor.charter_id))return out({error:"Yetkisiz işlem."},403);
    const {data:saved,error}=await ctx.supabaseAdmin.from("km_entries").update({status:body.approve===false?"rejected":"active",approved_by:actor.id}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);await audit(body.approve===false?"Kilometre reddedildi":"Kilometre onaylandı","km",body.id,{km:item.km});await notify({recipient_id:item.member_id,type:"Kilometre",title:body.approve===false?"Kilometre reddedildi":"Kilometre onaylandı",body:`${item.route_name} · ${item.km} km`,action_path:"km"});return out({item:saved});
  }
  if(action==="km.delete"){
    const {data:item}=await ctx.supabaseAdmin.from("km_entries").select("*,profiles:member_id(charter_id)").eq("id",body.id).maybeSingle();if(!item)return out({error:"Kayıt bulunamadı."},404);
    const own=item.member_id===actor.id,manager=fullNational||item.profiles?.charter_id===actor.charter_id;
    if(!own&&!manager)return out({error:"Yetkisiz işlem."},403);
    if(item.status!=="pending")return out({error:"Yalnızca onay bekleyen kayıt silinebilir."},400);
    const {error}=await ctx.supabaseAdmin.from("km_entries").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Kilometre talebi silindi","km",body.id,{km:item.km});return out({ok:true});
  }
  if(action==="attendance.set"){
    const {data:event}=await ctx.supabaseAdmin.from("events").select("owner_charter_id").eq("id",body.eventId).maybeSingle();if(!event)return out({error:"Etkinlik bulunamadı."},404);const canManageAttendance=manages("event",event.owner_charter_id)||actor.national_role==="National Road Captain";if(!canManageAttendance)return out({error:"Yoklama yönetimi yetkin yok."},403);
    const status=String(body.status||"waiting");if(!["waiting","attended","absent","excused"].includes(status))return out({error:"Geçersiz yoklama durumu."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("attendance").upsert({event_id:body.eventId,member_id:body.memberId,status,marked_by:actor.id,marked_at:new Date().toISOString()},{onConflict:"event_id,member_id"}).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="attendance.finalize"){
    const {data:event}=await ctx.supabaseAdmin.from("events").select("owner_charter_id").eq("id",body.eventId).maybeSingle();if(!event)return out({error:"Etkinlik bulunamadı."},404);const canFinalize=manages("event",event.owner_charter_id)||actor.national_role==="National Road Captain";if(!canFinalize)return out({error:"Yetkisiz işlem."},403);const {data,error}=await ctx.supabaseAdmin.rpc("finalize_event_attendance",{p_event_id:body.eventId,p_actor_id:actor.id});if(error)return out({error:error.message},400);return out({credited:data});
  }
  if(action==="notification.read"||action==="notification.delete"){
    const query=action.endsWith("delete")?ctx.supabaseAdmin.from("notifications").delete():ctx.supabaseAdmin.from("notifications").update({read_at:new Date().toISOString()});
    const {data,error}=await query.eq("id",body.id).eq("recipient_id",actor.id).select("id");if(error)return out({error:error.message},400);if(!data?.length)return out({error:"Bildirim bulunamadı."},404);return out({ok:true});
  }
  if(action==="notification.clear"){
    const {error}=await ctx.supabaseAdmin.from("notifications").delete().eq("recipient_id",actor.id);if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="push.subscribe"){
    const endpoint=String(body.endpoint||""),p256dh=String(body.keys?.p256dh||""),authKey=String(body.keys?.auth||"");if(!endpoint.startsWith("https://")||!p256dh||!authKey)return out({error:"Geçersiz cihaz aboneliği."},400);
    const {error}=await ctx.supabaseAdmin.from("push_subscriptions").upsert({member_id:actor.id,endpoint,p256dh,auth:authKey,user_agent:String(body.userAgent||"").slice(0,500),updated_at:new Date().toISOString()},{onConflict:"endpoint"});if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="push.unsubscribe"){
    const {error}=await ctx.supabaseAdmin.from("push_subscriptions").delete().eq("member_id",actor.id).eq("endpoint",String(body.endpoint||""));if(error)return out({error:error.message},400);return out({ok:true});
  }
  if(action==="ticket.delete"){
    const {data:ticket}=await ctx.supabaseAdmin.from("help_tickets").select("reporter_id").eq("id",body.id).maybeSingle();
    if(!ticket||(!actor.is_app_admin&&ticket.reporter_id!==actor.id))return out({error:"Yetkisiz işlem."},403);
    const {error}=await ctx.supabaseAdmin.from("help_tickets").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    return out({ok:true});
  }
  if(action==="ticket.create"){
    const subject=String(body.subject||"").trim(),text=String(body.body||"").trim();if(!subject||!text)return out({error:"Başlık ve açıklama zorunlu."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("help_tickets").insert({reporter_id:actor.id,subject,body:text,status:"Yeni",screenshot_path:body.screenshotPath||null}).select().single();if(error)return out({error:error.message},400);
    const {data:admins}=await ctx.supabaseAdmin.from("profiles").select("id").eq("is_app_admin",true).eq("account_status","active").neq("id",actor.id);if(admins?.length)await notify(admins.map((x:any)=>({recipient_id:x.id,type:"Destek",title:subject,body:`${actor.nick} yeni bir destek kaydı oluşturdu.`,action_path:"helpAdmin"})));
    return out({item});
  }
  if(action==="ticket.reply"){
    if(!actor.is_app_admin)return out({error:"Yalnızca uygulama admini yanıtlayabilir."},403);const status=String(body.status||"Yanıtlandı");const {data:item,error}=await ctx.supabaseAdmin.from("help_tickets").update({admin_reply:String(body.reply||""),status,updated_at:new Date().toISOString()}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="ticket.message"||action==="ticket.status"){
    const {data:ticket}=await ctx.supabaseAdmin.from("help_tickets").select("*").eq("id",body.id).maybeSingle();if(!ticket||(!actor.is_app_admin&&ticket.reporter_id!==actor.id))return out({error:"Destek kaydına erişim yok."},403);
    if(action.endsWith("message")){const message=String(body.message||"").trim();if(!message)return out({error:"Yanıt metni boş."},400);if(!actor.is_app_admin&&ticket.status==="Çözüldü")return out({error:"Çözülen kayıt yanıt kabul etmiyor."},409);const {data:item,error}=await ctx.supabaseAdmin.from("help_ticket_messages").insert({ticket_id:ticket.id,sender_id:actor.id,body:message}).select().single();if(error)return out({error:error.message},400);await ctx.supabaseAdmin.from("help_tickets").update({status:actor.is_app_admin&&ticket.status==="Yeni"?"İnceleniyor":ticket.status,updated_at:new Date().toISOString()}).eq("id",ticket.id);
      if(actor.is_app_admin&&ticket.reporter_id!==actor.id)await notify({recipient_id:ticket.reporter_id,type:"Destek",title:ticket.subject,body:"Destek kaydına yönetim yanıt verdi.",action_path:"help"});
      if(!actor.is_app_admin){const {data:admins}=await ctx.supabaseAdmin.from("profiles").select("id").eq("is_app_admin",true).eq("account_status","active");if(admins?.length)await notify(admins.map((x:any)=>({recipient_id:x.id,type:"Destek",title:ticket.subject,body:`${actor.nick} destek kaydına yanıt verdi.`,action_path:"helpAdmin"})))}return out({item})}
    if(!actor.is_app_admin)return out({error:"Durumu yalnızca uygulama admini değiştirebilir."},403);const status=String(body.status||"");if(!["Yeni","İnceleniyor","Çözüldü"].includes(status))return out({error:"Geçersiz durum."},400);const {data:item,error}=await ctx.supabaseAdmin.from("help_tickets").update({status,updated_at:new Date().toISOString()}).eq("id",ticket.id).select().single();if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="note.delete"){
    const {data:note}=await ctx.supabaseAdmin.from("member_notes").select("id,charter_id").eq("id",body.id).maybeSingle();
    if(!note||(!national&&note.charter_id!==actor.charter_id))return out({error:"Bu not için yetkin yok."},403);if(!national&&!actor.charter_role)return out({error:"Yönetim yetkisi gerekli."},403);
    const {error}=await ctx.supabaseAdmin.from("member_notes").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Üye notu silindi","member_note",body.id);return out({ok:true});
  }
  if(action==="note.update"){
    const {data:note}=await ctx.supabaseAdmin.from("member_notes").select("id,charter_id").eq("id",body.id).maybeSingle();
    if(!note||(!national&&note.charter_id!==actor.charter_id))return out({error:"Bu not için yetkin yok."},403);if(!national&&!actor.charter_role)return out({error:"Yönetim yetkisi gerekli."},403);
    const {data:item,error}=await ctx.supabaseAdmin.from("member_notes").update({note_type:String(body.noteType||"Genel"),body:String(body.body||"")}).eq("id",body.id).select().single();if(error)return out({error:error.message},400);
    await audit("Üye notu düzenlendi","member_note",body.id);return out({item});
  }
  if(action==="note.create"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("id,charter_id").eq("id",body.memberId).maybeSingle();if(!target||(!national&&target.charter_id!==actor.charter_id))return out({error:"Bu üye için not yetkin yok."},403);if(!national&&!actor.charter_role)return out({error:"Yönetim yetkisi gerekli."},403);
    const {data:item,error}=await ctx.supabaseAdmin.from("member_notes").insert({member_id:target.id,charter_id:target.charter_id,note_type:String(body.noteType||"Genel"),body:String(body.body||""),created_by:actor.id}).select().single();if(error)return out({error:error.message},400);await audit("Üye notu eklendi","profile",target.id);return out({item});
  }
  if(action==="member.update"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("*").eq("id",body.memberId).maybeSingle();if(!target)return out({error:"Üye bulunamadı."},404);
    const sameCharter=target.charter_id===actor.charter_id,localManager=!!actor.charter_role&&sameCharter;
    const self=target.id===actor.id;
    if(!self&&!fullNational&&!actor.is_app_admin&&!localManager)return out({error:"Bu üyeyi düzenleme yetkin yok."},403);
    if(!self&&localManager&&!fullNational&&!actor.is_app_admin&&(target.is_app_admin||target.national_role))return out({error:"Charter yönetimi National veya uygulama yöneticisi hesabını değiştiremez."},403);
    const patch:any={updated_at:new Date().toISOString()};
    if(self){if(body.phone!==undefined)patch.phone=String(body.phone||"").replace(/\D/g,"");if(body.motorcycle!==undefined)patch.motorcycle=String(body.motorcycle||"").trim();if(body.licenseClass!==undefined)patch.license_class=String(body.licenseClass||"").trim();if(body.avatarPath!==undefined)patch.avatar_path=body.avatarPath||null;if(body.birthday!==undefined)patch.birthday=/^\d{4}-\d{2}-\d{2}$/.test(String(body.birthday||""))?body.birthday:null}
    if(!self&&(actor.is_app_admin||fullNational||localManager)){if(body.phone!==undefined)patch.phone=String(body.phone||"").replace(/\D/g,"");if(body.motorcycle!==undefined)patch.motorcycle=String(body.motorcycle||"").trim()}
    if(body.fullName!==undefined||body.nick!==undefined||body.charterId!==undefined){if(!actor.is_app_admin&&!fullNational)return out({error:"Kimlik ve Charter bilgisini değiştirme yetkin yok."},403);if(body.fullName!==undefined){const fullName=String(body.fullName||"").trim();if(fullName.length<3)return out({error:"İsim soyisim geçerli değil."},400);patch.full_name=fullName}if(body.nick!==undefined){const nick=String(body.nick||"").trim();if(nick.length<2)return out({error:"Nick geçerli değil."},400);patch.nick=nick}if(body.charterId!==undefined)patch.charter_id=body.charterId}
    if(body.accountStatus){const allowed=actor.is_app_admin||fullNational||["President","Vice President","Secretary","Sgt. at Arms"].includes(actor.charter_role||"");if(!allowed)return out({error:"Üyelik durumu yetkin yok."},403);patch.account_status=body.accountStatus}
    if(body.memberLevel){if(!actor.is_app_admin&&!fullNational&&!localManager)return out({error:"Üyelik seviyesi atama yetkin yok."},403);if(!["hangaround","prospect","member"].includes(body.memberLevel))return out({error:"Geçersiz üyelik seviyesi."},400);patch.member_level=body.memberLevel}
    if(body.charterRole!==undefined){if(!actor.is_app_admin&&!fullNational&&!["President","Vice President"].includes(actor.charter_role||""))return out({error:"Charter görevi atama yetkin yok."},403);if(body.charterRole==="President"&&!actor.is_app_admin&&!fullNational)return out({error:"Başkanlık ataması National onayı gerektirir."},403);patch.charter_role=body.charterRole||null}
    if(body.nationalRole!==undefined||body.isAppAdmin!==undefined){if(!actor.is_app_admin&&!NATIONAL_FULL.has(actor.national_role||""))return out({error:"National görev atama yetkin yok."},403);if(body.nationalRole!==undefined)patch.national_role=body.nationalRole||null;if(body.isAppAdmin!==undefined){if(!actor.is_app_admin)return out({error:"Uygulama admini atamasını yalnızca uygulama admini yapabilir."},403);patch.is_app_admin=!!body.isAppAdmin}}
    const {data:item,error}=await ctx.supabaseAdmin.from("profiles").update(patch).eq("id",target.id).select().single();if(error)return out({error:error.message},400);await audit("Üye bilgisi güncellendi","profile",target.id,patch);
    const today=new Date().toISOString().slice(0,10);
    const closeRoleHistory=async(scope:string,oldRole:string|null)=>{
      if(!oldRole)return;
      const {data:open}=await ctx.supabaseAdmin.from("role_history").select("id").eq("member_id",target.id).eq("role_scope",scope).is("ended_at",null).maybeSingle();
      if(open)await ctx.supabaseAdmin.from("role_history").update({ended_at:today}).eq("id",open.id);
      else await ctx.supabaseAdmin.from("role_history").insert({member_id:target.id,role_scope:scope,role_name:oldRole,started_at:String(target.approved_at||target.created_at||today).slice(0,10),ended_at:today});
    };
    if(patch.charter_role!==undefined&&patch.charter_role!==target.charter_role){await closeRoleHistory("charter",target.charter_role);if(patch.charter_role)await ctx.supabaseAdmin.from("role_history").insert({member_id:target.id,role_scope:"charter",role_name:patch.charter_role,started_at:today})}
    if(patch.national_role!==undefined&&patch.national_role!==target.national_role){await closeRoleHistory("national",target.national_role);if(patch.national_role)await ctx.supabaseAdmin.from("role_history").insert({member_id:target.id,role_scope:"national",role_name:patch.national_role,started_at:today})}
    return out({item});
  }
  if(action==="role_history.update"){
    const {data:row}=await ctx.supabaseAdmin.from("role_history").select("*,profiles:member_id(charter_id)").eq("id",body.id).maybeSingle();if(!row)return out({error:"Görev kaydı bulunamadı."},404);
    const localManager=!!actor.charter_role&&row.profiles?.charter_id===actor.charter_id;
    if(!actor.is_app_admin&&!fullNational&&!localManager)return out({error:"Görev geçmişini düzenleme yetkin yok."},403);
    const patch:any={};
    if(body.startedAt!==undefined){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(body.startedAt||"")))return out({error:"Başlangıç tarihi geçersiz."},400);patch.started_at=body.startedAt}
    if(body.endedAt!==undefined)patch.ended_at=body.endedAt?(/^\d{4}-\d{2}-\d{2}$/.test(String(body.endedAt))?body.endedAt:null):null;
    if(!Object.keys(patch).length)return out({error:"Güncellenecek alan yok."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("role_history").update(patch).eq("id",body.id).select().single();if(error)return out({error:error.message},400);await audit("Görev geçmişi düzenlendi","role_history",body.id,patch);return out({item});
  }
  if(action==="member.create"){
    if(!actor.is_app_admin)return out({error:"Üye ekleme yalnızca uygulama adminine açıktır."},403);
    const fullName=String(body.fullName||"").trim(),nick=String(body.nick||"").trim(),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),phone=String(body.phone||"").replace(/\D/g,""),charterId=String(body.charterId||""),memberLevel=String(body.memberLevel||"member"),charterRole=body.charterRole?String(body.charterRole):null,nationalRole=body.nationalRole?String(body.nationalRole):null;
    if(fullName.length<3||nick.length<2||!email.includes("@")||password.length<8||!charterId)return out({error:"İsim, nick, geçerli e-posta, en az 8 karakter şifre ve Charter zorunludur."},400);
    if(!["hangaround","prospect","member"].includes(memberLevel))return out({error:"Geçersiz üyelik statüsü."},400);
    const [{data:duplicateNick},{data:duplicateName},{data:charter}]=await Promise.all([ctx.supabaseAdmin.from("profiles").select("id").ilike("nick",nick).limit(1),ctx.supabaseAdmin.from("profiles").select("id").ilike("full_name",fullName).limit(1),ctx.supabaseAdmin.from("charters").select("id").eq("id",charterId).eq("active",true).maybeSingle()]);
    if(!charter)return out({error:"Charter bulunamadı."},404);if(duplicateNick?.length||duplicateName?.length)return out({error:"Bu nick veya isimle kayıtlı bir üye var."},409);
    const {data:created,error:createError}=await ctx.supabaseAdmin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{registration_source:"app_admin",created_by:actor.id}});if(createError||!created.user)return out({error:createError?.message||"Hesap oluşturulamadı."},409);
    const profile={id:created.user.id,nick,full_name:fullName,phone,member_level:memberLevel,account_status:"active",charter_id:charterId,charter_role:charterRole,national_role:nationalRole,is_app_admin:false,approved_by:actor.id,approved_at:new Date().toISOString()};
    const {data:item,error}=await ctx.supabaseAdmin.from("profiles").upsert(profile,{onConflict:"id"}).select().single();if(error){await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id);return out({error:error.message},409)}
    const createdToday=new Date().toISOString().slice(0,10);if(charterRole)await ctx.supabaseAdmin.from("role_history").insert({member_id:item.id,role_scope:"charter",role_name:charterRole,started_at:createdToday});if(nationalRole)await ctx.supabaseAdmin.from("role_history").insert({member_id:item.id,role_scope:"national",role_name:nationalRole,started_at:createdToday});
    await ctx.supabaseAdmin.from("membership_milestones").upsert({member_id:item.id,milestone:memberLevel,occurred_on:createdToday,recorded_by:actor.id},{onConflict:"member_id,milestone",ignoreDuplicates:true});
    await audit("Üye eklendi","profile",item.id,{nick,fullName});return out({item});
  }
  if(action==="application.decide"){
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("*").eq("id",body.memberId).eq("account_status","pending").maybeSingle();if(!target)return out({error:"Bekleyen başvuru bulunamadı."},404);
    const reviewer=actor.is_app_admin||fullNational||(actor.charter_role==="Sgt. at Arms"&&actor.charter_id===target.charter_id);if(!reviewer)return out({error:"Başvuru onaylama yetkin yok."},403);
    const approved=body.approve!==false,patch=approved?{account_status:"active",member_level:target.requested_member_level||target.member_level,charter_role:target.requested_charter_role||target.charter_role,national_role:fullNational?(target.requested_national_role||target.national_role):target.national_role,approved_by:actor.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{account_status:"rejected",approved_by:actor.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {data:item,error}=await ctx.supabaseAdmin.from("profiles").update(patch).eq("id",target.id).select().single();if(error)return out({error:error.message},400);
    if(approved){const today=new Date().toISOString().slice(0,10);if((patch as any).charter_role&&(patch as any).charter_role!==target.charter_role)await ctx.supabaseAdmin.from("role_history").insert({member_id:target.id,role_scope:"charter",role_name:(patch as any).charter_role,started_at:today});if((patch as any).national_role&&(patch as any).national_role!==target.national_role)await ctx.supabaseAdmin.from("role_history").insert({member_id:target.id,role_scope:"national",role_name:(patch as any).national_role,started_at:today});await ctx.supabaseAdmin.from("membership_milestones").upsert({member_id:target.id,milestone:(patch as any).member_level,occurred_on:today,recorded_by:actor.id},{onConflict:"member_id,milestone",ignoreDuplicates:true})}
    if(target.full_name)await ctx.supabaseAdmin.from("notifications").update({read_at:new Date().toISOString()}).eq("type","Başvuru").ilike("body",`%${target.full_name}%`).is("read_at",null);
    await audit(approved?"Üyelik onaylandı":"Üyelik reddedildi","profile",target.id);await notify({recipient_id:target.id,type:"Üyelik",title:approved?"Üyeliğin onaylandı":"Başvurun reddedildi",body:approved?"Artık uygulamayı tam yetkiyle kullanabilirsin.":"Başvurun yönetim tarafından reddedildi.",action_path:"profile"});return out({item});
  }
  if(action==="charter.create"){
    if(!actor.is_app_admin&&!fullNational)return out({error:"Charter ekleme yetkin yok."},403);const name=String(body.name||"").trim();if(!name)return out({error:"Charter adı zorunlu."},400);const {data:item,error}=await ctx.supabaseAdmin.from("charters").insert({name}).select().single();if(error)return out({error:error.message},400);await audit("Charter oluşturuldu","charter",item.id,{name});return out({item});
  }
  if(action==="account.deletion.request"){
    const {data:existing}=await ctx.supabaseAdmin.from("account_deletion_requests").select("*").eq("member_id",actor.id).eq("status","requested").maybeSingle();
    if(existing)return out({item:existing});
    const {data:item,error}=await ctx.supabaseAdmin.from("account_deletion_requests").insert({member_id:actor.id,status:"requested"}).select().single();
    if(error)return out({error:error.message},400);
    const {data:admins}=await ctx.supabaseAdmin.from("profiles").select("id").eq("is_app_admin",true).eq("account_status","active").neq("id",actor.id);
    if(admins?.length)await notify(admins.map((x:any)=>({recipient_id:x.id,type:"Hesap",title:"Hesap kapatma talebi",body:`${actor.nick} hesabının kapatılmasını istiyor.`,action_path:"members"})));
    await audit("Hesap kapatma talebi oluşturuldu","account_deletion_request",item.id);
    return out({item});
  }
  if(action==="account.deletion.cancel"){
    const {data:item,error}=await ctx.supabaseAdmin.from("account_deletion_requests").update({status:"cancelled",decided_at:new Date().toISOString()}).eq("member_id",actor.id).eq("status","requested").select().maybeSingle();
    if(error)return out({error:error.message},400);return out({item});
  }
  if(action==="account.deletion.decide"){
    if(!actor.is_app_admin)return out({error:"Hesap kapatma taleplerini yalnızca uygulama admini sonuçlandırabilir."},403);
    const {data:request}=await ctx.supabaseAdmin.from("account_deletion_requests").select("*").eq("id",body.id).eq("status","requested").maybeSingle();
    if(!request)return out({error:"Bekleyen talep bulunamadı."},404);
    const approve=body.approve!==false,status=approve?"completed":"rejected",now=new Date().toISOString();
    if(approve){const {error:profileError}=await ctx.supabaseAdmin.from("profiles").update({account_status:"left",updated_at:now}).eq("id",request.member_id);if(profileError)return out({error:profileError.message},400);await ctx.supabaseAdmin.from("push_subscriptions").delete().eq("member_id",request.member_id)}
    const {data:item,error}=await ctx.supabaseAdmin.from("account_deletion_requests").update({status,decided_by:actor.id,decided_at:now,decision_note:String(body.note||"").trim()}).eq("id",request.id).select().single();
    if(error)return out({error:error.message},400);await audit(approve?"Hesap erişimi kapatıldı":"Hesap kapatma talebi reddedildi","account_deletion_request",request.id,{memberId:request.member_id});return out({item});
  }
  if(action==="culture.save"){
    if(!national)return out({error:"Kültür içeriği düzenleme yetkin yok."},403);
    const title=String(body.title||"").trim(),bodyText=String(body.body||"").trim();
    if(!title||!bodyText)return out({error:"Başlık ve açıklama zorunlu."},400);
    const query=body.id?ctx.supabaseAdmin.from("culture_items").update({title,body:bodyText,updated_at:new Date().toISOString()}).eq("id",body.id):ctx.supabaseAdmin.from("culture_items").insert({title,body:bodyText,position:Number(body.position||0),created_by:actor.id});
    const {data:item,error}=await query.select().single();if(error)return out({error:error.message},400);
    await audit(body.id?"Kültür içeriği düzenlendi":"Kültür içeriği eklendi","culture_item",item.id,{title});
    return out({item});
  }
  if(action==="culture.delete"){
    if(!national)return out({error:"Kültür içeriği silme yetkin yok."},403);
    const {error}=await ctx.supabaseAdmin.from("culture_items").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Kültür içeriği silindi","culture_item",body.id);
    return out({ok:true});
  }
  if(action==="milestone.save"){
    const memberId=String(body.memberId||actor.id);
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("id,charter_id").eq("id",memberId).maybeSingle();
    if(!target)return out({error:"Üye bulunamadı."},404);
    const self=target.id===actor.id,isSgt=actor.charter_role==="Sgt. at Arms"&&target.charter_id===actor.charter_id;
    if(!self&&!isSgt&&!national)return out({error:"Bu bilgiyi düzenleme yetkin yok."},403);
    const milestone=String(body.milestone||"");if(!["hangaround","prospect","member"].includes(milestone))return out({error:"Geçersiz aşama."},400);
    const date=String(body.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return out({error:"Geçerli bir tarih gir."},400);
    const {data:item,error}=await ctx.supabaseAdmin.from("membership_milestones").upsert({member_id:target.id,milestone,occurred_on:date,recorded_by:actor.id,updated_at:new Date().toISOString()},{onConflict:"member_id,milestone"}).select().single();
    if(error)return out({error:error.message},400);
    await audit("Üyelik aşaması kaydedildi","membership_milestone",target.id,{milestone,date});
    return out({item});
  }
  if(action==="badge.award"||action==="badge.revoke"){
    if(action==="badge.award"){
      const memberId=String(body.memberId||"");
      const {data:target}=await ctx.supabaseAdmin.from("profiles").select("id,charter_id").eq("id",memberId).maybeSingle();
      if(!target)return out({error:"Üye bulunamadı."},404);
      const isSgt=actor.charter_role==="Sgt. at Arms"&&target.charter_id===actor.charter_id;
      if(!isSgt&&!national)return out({error:"Rozet yönetimi yetkin yok."},403);
      const badgeKey=String(body.badgeKey||"");if(!MANUAL_BADGES.has(badgeKey))return out({error:"Geçersiz rozet."},400);
      const {data:item,error}=await ctx.supabaseAdmin.from("member_badges").insert({member_id:target.id,badge_key:badgeKey,note:String(body.note||"").trim(),awarded_by:actor.id}).select().single();
      if(error)return out({error:error.message},400);
      await audit("Rozet verildi","member_badge",item.id,{badgeKey,memberId:target.id});
      await notify({recipient_id:target.id,type:"Rozet",title:"Yeni bir rozet kazandın!",body:`"${badgeKey}" rozetini kazandın.`,action_path:"profile"});
      return out({item});
    }
    const {data:existing}=await ctx.supabaseAdmin.from("member_badges").select("member_id").eq("id",body.id).maybeSingle();if(!existing)return out({error:"Rozet bulunamadı."},404);
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("charter_id").eq("id",existing.member_id).maybeSingle();
    const isSgt=actor.charter_role==="Sgt. at Arms"&&target?.charter_id===actor.charter_id;
    if(!isSgt&&!national)return out({error:"Rozet yönetimi yetkin yok."},403);
    const {error}=await ctx.supabaseAdmin.from("member_badges").delete().eq("id",body.id);if(error)return out({error:error.message},400);
    await audit("Rozet geri alındı","member_badge",body.id);
    return out({ok:true});
  }
  if(action==="admin.resetKm"){
    if(!actor.is_app_admin)return out({error:"Bu işlem yalnızca uygulama admini tarafından yapılabilir."},403);
    const {error}=body.charterId?await ctx.supabaseAdmin.from("km_entries").delete().in("member_id",((await ctx.supabaseAdmin.from("profiles").select("id").eq("charter_id",body.charterId)).data||[]).map((x:any)=>x.id)):await ctx.supabaseAdmin.from("km_entries").delete().not("id","is",null);
    if(error)return out({error:error.message},400);
    await audit("Kilometre kayıtları sıfırlandı","km_entries",body.charterId||"all",{charterId:body.charterId||null});
    return out({ok:true});
  }
  if(action==="admin.resetContent"){
    if(!actor.is_app_admin)return out({error:"Bu işlem yalnızca uygulama admini tarafından yapılabilir."},403);
    const targets=Array.isArray(body.targets)&&body.targets.length?body.targets:["events","announcements","routes"];
    const tableByTarget:{[key:string]:string}={events:"events",announcements:"announcements",routes:"routes",clubhouse:"clubhouse_visits"};
    if(targets.includes("events"))await ctx.supabaseAdmin.from("km_entries").update({event_id:null}).not("event_id","is",null);
    for(const t of targets){
      const table=tableByTarget[t];if(!table)continue;
      const {error}=await ctx.supabaseAdmin.from(table).delete().not("id","is",null);
      if(error)return out({error:error.message},400);
    }
    if(targets.includes("clubhouse")){const {error}=await ctx.supabaseAdmin.from("clubhouse_states").delete().not("charter_id","is",null);if(error)return out({error:error.message},400)}
    await audit("İçerik sıfırlandı (etkinlik/duyuru/rota/kulüp evi)","content_reset","all",{targets});
    return out({ok:true});
  }
  if(action==="admin.deleteAccount"){
    if(!actor.is_app_admin)return out({error:"Bu işlem yalnızca uygulama admini tarafından yapılabilir."},403);
    const memberId=String(body.memberId||"");
    if(!memberId||memberId===actor.id)return out({error:"Geçersiz hesap."},400);
    const {data:target}=await ctx.supabaseAdmin.from("profiles").select("nick").eq("id",memberId).maybeSingle();
    if(!target)return out({error:"Üye bulunamadı."},404);
    const {error}=await ctx.supabaseAdmin.auth.admin.deleteUser(memberId);
    if(error)return out({error:error.message},400);
    await audit("Hesap kalıcı olarak silindi","profile",memberId,{nick:target.nick});
    return out({ok:true});
  }
  return out({error:"Bilinmeyen işlem."},404);
})};
