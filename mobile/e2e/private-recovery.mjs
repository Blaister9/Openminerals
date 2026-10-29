import {spawnSync} from 'node:child_process';
import {requireSafe} from './ci-safety.mjs';
// Exact test-only key field; raw account XML is never written on the host or
// included in public diagnostics. No screenshot is taken during recovery.
export function privateRecoveryKey(xml,id){
  requireSafe(['recovery-generated-key','recovery-completed-key'].includes(id)&&typeof xml==='string'&&xml.length<=2000000&&!/<!DOCTYPE|<!ENTITY/i.test(xml),'Invalid private recovery capture.');
  const script='import sys,json,xml.etree.ElementTree as E\np=json.load(sys.stdin)\nr=E.fromstring(p["xml"])\na=[n.get("text","") for n in r.iter("node") if n.get("resource-id","")==p["id"] or n.get("resource-id","").endswith("/"+p["id"])]\nassert len(a)==1\nprint(json.dumps({"key":a[0]}))';
  const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',script],{input:JSON.stringify({xml,id}),encoding:'utf8',timeout:10000,maxBuffer:10000,windowsHide:true,env:Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^OPENMINERALS_QA_|^MAESTRO_|TOKEN|PASSWORD|SECRET/.test(name)))});
  requireSafe(!result.error&&result.status===0,'Private recovery field unavailable.');const key=JSON.parse(result.stdout).key;
  requireSafe(typeof key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(key),'Private recovery key format invalid.');return key;
}
