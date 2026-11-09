import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script=new URL('../scripts/compare-production-schema.py',import.meta.url);
const expected=`CREATE TABLE store_profile(id INTEGER PRIMARY KEY,share_description TEXT NOT NULL DEFAULT 'Order 20L drinking water cans or packs of two 10L cans directly from WaterNow with convenient home delivery.');`;
const legacy=`CREATE TABLE store_profile(id INTEGER PRIMARY KEY,share_description TEXT NOT NULL DEFAULT 'Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.');`;
const incompatible=`CREATE TABLE store_profile(id INTEGER PRIMARY KEY,share_description INTEGER NOT NULL DEFAULT 'Order 20L drinking water cans or packs of two 10L cans from local suppliers with convenient home delivery.');`;
function run(actualSql,allow){
 const dir=mkdtempSync(join(tmpdir(),'waternow-schema-'));
 try{
  const e=join(dir,'expected.sql'),a=join(dir,'actual.sql');writeFileSync(e,expected);writeFileSync(a,actualSql);
  const args=[script.pathname,'--expected',e,'--actual',a];if(allow)args.push('--allow-legacy-waternow-share-description-default');
  return spawnSync('python3',args,{encoding:'utf8'});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('schema comparator permits only the known old WaterNow share-description default when explicitly enabled',()=>{
 assert.equal(run(legacy,true).status,0);
 assert.equal(run(legacy,false).status,1);
 assert.equal(run(incompatible,true).status,1);
});
