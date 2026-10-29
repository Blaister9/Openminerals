import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('provisioner rejects credentials inside the repository before network access or writes',()=>{
  const output=fileURLToPath(new URL('../private-credentials-must-not-exist',import.meta.url)),secret='Dummy-private-admin-never-transmitted-789';
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-demo.mjs',import.meta.url)),'--out',output,'--label','unit-guard','--kind','native'],{encoding:'utf8',env:{...process.env,DEMO_ADMIN_TOKEN:secret},timeout:10000});
  assert.equal(run.status,1);const result=JSON.parse(run.stderr);assert.equal(result.stage,'arguments');assert.equal(result.credentialsPrinted,false);assert.equal((run.stdout+run.stderr).includes(secret),false);
});
