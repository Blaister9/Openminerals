/** Non-destructive acceptance: creates only fresh, fictitious demo sessions. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=(process.argv[2]||'http://localhost:3000').replace(/\/$/,'');
const session=`receipt-smoke-${randomUUID()}`;
const other=`receipt-isolation-${randomUUID()}`;
async function request(path,{body,key,as=session,expected=200}={}){
  const response=await fetch(base+path,{
    method:body?'POST':'GET',
    headers:{'x-demo-session':as,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(20_000),
  });
  const data=await response.json();
  assert.equal(response.status,expected,`${path}: ${data.error||response.status}`);
  return data;
}

try{
  const health=await request('/health');
  assert.equal(health.ok,true);assert.equal(health.demoOnly,true);
  if(process.env.REQUIRE_POSTGRES==='true')assert.equal(health.mode,'postgres-demo');
  const conversionKey=randomUUID();
  const converted=await request('/api/demo/convert',{
    body:{from:'USD',to:'USDT',amount:'20.00'},key:conversionKey,
  });
  assert.equal(converted.receipt.outputMinor,2000);
  assert.equal(converted.receipt.balancesAfter.walletMinor.USDT,27000);
  const buy=await request('/api/demo/buy',{body:{metal:'XAU',grams:'0.500'},key:randomUUID()});
  assert.equal(buy.receipt.priceCentsPerGram,14500);
  assert.equal(buy.receipt.baseMinor,7250);assert.equal(buy.receipt.feeMinor,73);assert.equal(buy.receipt.totalMinor,7323);
  assert.equal(buy.receipt.balancesAfter.walletMinor.USDT,19677);
  assert.equal(buy.receipt.balancesAfter.holdingsMg.XAU,500);
  const sell=await request('/api/demo/sell',{body:{metal:'XAU',grams:'0.500'},key:randomUUID()});
  assert.equal(sell.receipt.outputMinor,7163);
  assert.equal(sell.receipt.balancesAfter.walletMinor.USDT,26840);
  assert.equal(sell.receipt.balancesAfter.holdingsMg.XAU,0);
  console.log('PASS conversion, buy/sell amounts and resulting balance snapshots');

  // Exceed the old 100-event window without changing any owner's session.
  for(let start=0;start<105;start+=7){
    await Promise.all(Array.from({length:Math.min(7,105-start)},()=>request('/api/demo/deposit',{
      body:{currency:'USDT',amount:'0.01'},key:randomUUID(),
    })));
  }
  const first=await request('/api/demo/history?limit=20');
  assert.equal(first.total,108);
  const seen=[...first.items];
  let cursor=first.nextCursor;
  await request('/api/demo/deposit',{body:{currency:'USDT',amount:'0.01'},key:randomUUID()});
  while(cursor){
    const page=await request(`/api/demo/history?limit=20&before=${encodeURIComponent(cursor)}`);
    seen.push(...page.items);cursor=page.nextCursor;
  }
  assert.equal(seen.length,108);
  assert.equal(new Set(seen.map(receipt=>receipt.id)).size,108);
  assert.ok(seen.some(receipt=>receipt.id===conversionKey));
  assert.deepEqual(await request(`/api/demo/receipts/${conversionKey}`),converted.receipt);
  const replay=await request('/api/demo/convert',{
    body:{from:'USD',to:'USDT',amount:'20.00'},key:conversionKey,
  });
  assert.deepEqual(replay.receipt,{...converted.receipt,replayed:true});
  assert.equal((await request('/api/demo/history?limit=1')).total,109);
  assert.equal((await request('/api/demo/state')).movements.length,100);
  console.log('PASS history beyond 100 movements, stable pagination, persisted receipt and replay');

  assert.equal((await request('/api/demo/history',{as:other})).total,0);
  await request(`/api/demo/receipts/${conversionKey}`,{as:other,expected:404});
  await request('/api/demo/history?limit=51',{expected:400});
  console.log('PASS session isolation and invalid pagination rejection');
  console.log(`RECEIPT SMOKE PASSED · ${base} · ${health.mode}`);
}catch(error){
  console.error('RECEIPT SMOKE FAILED:',error.message);
  process.exitCode=1;
}
