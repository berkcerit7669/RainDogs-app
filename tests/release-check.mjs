import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=path.resolve(import.meta.dirname,"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("index.html");
const failures=[];
const requireText=(file,text)=>{if(!read(file).includes(text))failures.push(`${file}: ${text} bulunamadı`)};

for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
  try{new vm.Script(match[1],{filename:"index.html:inline"})}catch(error){failures.push(`Inline JavaScript: ${error.message}`)}
}
for(const file of ["supabase-auth.js","supabase-data.js","push-client.js","service-worker.js"]){
  try{new vm.Script(read(file),{filename:file})}catch(error){failures.push(`${file}: ${error.message}`)}
}
for(const file of ["index.html","supabase-auth.js","supabase-data.js","push-client.js","service-worker.js","manifest.webmanifest","icon.svg"]){if(!fs.existsSync(path.join(root,file)))failures.push(`${file} eksik`)}
requireText("index.html","Content-Security-Policy");
requireText("index.html","Aktif etkinlik yok");
requireText("index.html","Hesabımı Kapat");
requireText("supabase/functions/app-api/index.ts",'action==="account.deletion.request"');
requireText("supabase/functions/app-api/index.ts",'const NATIONAL_FULL=new Set(["Amir","NVP","National Secretary","National Sgt. at Arms"])');
const client=[html,read("supabase-auth.js"),read("supabase-data.js"),read("push-client.js")].join("\n");
for(const forbidden of [/service_role/i,/SUPABASE_SERVICE_ROLE_KEY/])if(forbidden.test(client))failures.push(`İstemci paketinde yasaklı sır bulundu: ${forbidden}`);
if(failures.length){console.error(failures.join("\n"));process.exit(1)}
console.log("RainDogs yayın kontrolleri başarılı.");
