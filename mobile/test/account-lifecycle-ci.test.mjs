import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createStore} from '../../api/src/store.js';
import {accountFlow,expectedImportedWallet,verifyImportedState,walletCurrencies} from '../e2e/account-lifecycle.mjs';
import {privateRecoveryKey} from '../e2e/private-recovery.mjs';
import {flowSelectors} from '../e2e/ci-diagnostics.mjs';
const yaml=createRequire(import.meta.url)('yaml');
test('account lifecycle uses valid bounded private flows and no screenshots or state clearing',()=>{
  for(const [name,currency] of [...walletCurrencies.map(currency=>['wallet',currency]),...['import','setup','hide-and-logout','recover-start','recover-complete','reenter'].map(name=>[name])]){
    const source=accountFlow(name,currency),documents=yaml.parseAllDocuments(source);assert.equal(documents.length,2);assert.ok(documents.every(document=>document.errors.length===0));
    assert.equal(documents[0].toJSON().appId,'com.openminerals.demo.mobile');assert.doesNotMatch(source,/takeScreenshot|clearState|clearKeychain|uninstall|DEMO_ADMIN_TOKEN/);
    const selectors=flowSelectors(source);assert.ok(selectors.length>0);assert.equal(selectors.some(value=>value.includes('MAESTRO_')),false);
  }
  assert.throws(()=>accountFlow('wallet','__proto__'));assert.throws(()=>accountFlow('unknown'));
});
test('native currency postconditions match all twenty real legacy commands and explicit import',async()=>{
  const store=await createStore(''),session='legacy-currency-'+randomUUID(),command=(action,body)=>({action,...body,requestId:randomUUID()});
  try{
    for(const currency of walletCurrencies){
      await store.mutate(session,command('deposit',{currency,amount:'1.25'}));await store.mutate(session,command('withdraw',{currency,amount:'1.25'}));
      for(const to of walletCurrencies.filter(value=>value!==currency))await store.mutate(session,command('convert',{from:currency,to,amount:currency==='COP'?'10000':'1'}));
    }
    const account=await store.registerAccount({alias:'native_currency_'+randomUUID().slice(0,8),password:'Exclusive-native-currency-789',legacySessionId:session}),state=await store.getAccountState(account.account.id);
    assert.deepEqual(state.walletMinor,expectedImportedWallet());assert.equal(state.walletMinor.USDT,25158);verifyImportedState(state);
    const wrong=structuredClone(state);wrong.walletMinor.EUR++;assert.throws(()=>verifyImportedState(wrong));
    const incomplete=structuredClone(state);delete incomplete.receipts[Object.keys(incomplete.receipts)[0]];assert.throws(()=>verifyImportedState(incomplete));
    assert.equal((await store.get(session)).legacyReadOnly,true);
  }finally{await store.close();}
});
test('private recovery parser selects one exact field and rejects entities duplicate fields or unrelated text',()=>{
  const key='K'.repeat(43),field='<node resource-id="recovery-generated-key" text="'+key+'"/>',xml='<hierarchy>'+field+'<node text="DO_NOT_CAPTURE_PRIVATE_ALIAS"/></hierarchy>';
  assert.equal(privateRecoveryKey(xml,'recovery-generated-key'),key);
  for(const bad of ['<!DOCTYPE x><hierarchy/>','<hierarchy>'+field+field+'</hierarchy>','<hierarchy><node text="'+key+'"/></hierarchy>','x'.repeat(2000001)])assert.throws(()=>privateRecoveryKey(bad,'recovery-generated-key'));
  assert.throws(()=>privateRecoveryKey(xml,'unknown-field'));
});
test('candidate matrix remains manual and binds independent private fixtures with bounded public runners',async()=>{
  const workflow=yaml.parse(await readFile(new URL('../../.github/workflows/android-ui.yml',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.equal(workflow.on.workflow_dispatch.inputs.case_scope.default,'single');
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.case_scope.options,['single','all','XAU','XAG','XPT','XPD','ACCOUNTS']);
  const job=workflow.jobs['android-ui'];assert.equal(job.strategy['fail-fast'],false);assert.equal(job.strategy['max-parallel'],4);assert.equal(job['runs-on'],'ubuntu-24.04');
  const credentials=job.steps.find(step=>step.env?.OPENMINERALS_QA_BUYER_A_ALIAS).env;
  for(const [name,value] of Object.entries(credentials).filter(([name])=>name.startsWith('OPENMINERALS_QA_')))assert.ok(value.includes("format('OPENMINERALS_RC_{0}_"));
  assert.doesNotMatch(JSON.stringify(workflow),/DEMO_ADMIN_TOKEN|DATABASE_URL|EAS_TOKEN/);
});
