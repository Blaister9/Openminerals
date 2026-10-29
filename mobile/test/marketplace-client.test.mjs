import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAccountClient} from '../lib/account-client.ts';
import {receiptDetails,receiptSummary} from '../lib/receipt-presentation.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';

function storage(){const values=new Map();return {async getItem(key){return values.get(key)??null;},async setItem(key,value){values.set(key,value);},async removeItem(key){values.delete(key);}};}

test('marketplace: respuesta perdida y reapertura conservan identidad, comprobante, USDT y lotes',async()=>{
  const store=await createStore('');
  const server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}`;
  const password='Exclusive-market-client-fixture-123';
  try{
    const mine=await store.createMine({name:'Mina DEMO cliente marketplace'});
    const seller=await store.createAccount({alias:'market_client_seller',password,mineId:mine.id});
    const buyer=await store.createAccount({alias:'market_client_buyer',password,mineId:mine.id});
    await store.mutateAccount(seller.id,{action:'buy',metal:'XAU',grams:'0.500',requestId:randomUUID()});
    const offer=await store.mutateAccount(seller.id,{action:'offer',metal:'XAU',grams:'0.200',price:'150.00',requestId:randomUUID()});
    const beforeSeller=await store.getAccountState(seller.id),beforeBuyer=await store.getAccountState(buyer.id);
    const oldLots=(await store.getCustody(seller.id)).allocations.filter(a=>a.mg>0).map(a=>a.lotId);
    const data=storage(),auth=storage();let lose=true;
    const options={api,storage:data,authStorage:auth,uuid:randomUUID};
    const first=createAccountClient({...options,fetchImpl:async(url,init)=>{
      const response=await fetch(url,init);
      if(lose&&url.endsWith('/market_buy')){lose=false;assert.equal(response.status,200);await response.json();throw new TypeError('Lost after settlement commit');}
      return response;
    }});
    await first.login('market_client_buyer',password);
    await assert.rejects(first.submit('market_buy',{sellerId:seller.id,offerId:offer.receipt.offer.id},'Comprar oferta DEMO'));
    const pending=first.getPending();assert.equal(pending.accountId,buyer.id);
    const restarted=createAccountClient(options);assert.deepEqual((await restarted.initialize()).pending,pending);
    const replay=await restarted.retry();assert.equal(replay.receipt.replayed,true);assert.equal(replay.receipt.id,pending.requestId);
    assert.equal(replay.state.holdingsMg.XAU,200);assert.equal(restarted.getPending(),null);
    const afterSeller=await store.getAccountState(seller.id),afterBuyer=await store.getAccountState(buyer.id);
    assert.equal(afterSeller.holdingsMg.XAU,300);assert.equal(afterBuyer.movements.filter(m=>m.type==='MARKET_BUY').length,1);
    assert.equal(afterBuyer.walletMinor.USDT,22000);
    assert.equal(afterSeller.walletMinor.USDT+afterBuyer.walletMinor.USDT+36,beforeSeller.walletMinor.USDT+beforeBuyer.walletMinor.USDT);
    const custody=await store.getCustody(buyer.id);assert.ok(custody.allocations.every(a=>oldLots.includes(a.lotId)));
    const sold=Object.values(afterSeller.receipts).find(r=>r.action==='market_sell');
    assert.match(receiptSummary(replay.receipt),/3[.,]000|30[.,]00/);assert.equal(sold.outputMinor,2964);
    assert.ok(receiptDetails(sold).some(row=>row.label==='Neto recibido'&&row.value.includes('29')));
    assert.equal(sold.tradeId,replay.receipt.tradeId);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
