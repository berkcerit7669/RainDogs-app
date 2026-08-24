import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync(new URL("../supabase/functions/app-api/index.ts",import.meta.url),"utf8");
test("tam national roller yalnızca tanımlı dört görevi içerir",()=>{
  assert.match(api,/NATIONAL_FULL=new Set\(\["Amir","NVP","National Secretary","National Sgt\. at Arms"\]\)/);
});
test("Türkiye geneli doğrudan yayın üç göreve açıktır",()=>{
  assert.match(api,/NATIONAL_DIRECT_PUBLISH=new Set\(\["Amir","NVP","National Secretary"\]\)/);
});
test("uygulama admini üye oluşturabilir ve hesap silme talebi ayrı akıştır",()=>{
  assert.match(api,/action==="member\.create"/);
  assert.match(api,/action==="account\.deletion\.request"/);
});
test("kurul içeriği sadece kurul üyelerine yüklenir",()=>{
  assert.match(api,/boardMember\?ctx\.supabaseAdmin\.from\("board_polls"\)/);
});
