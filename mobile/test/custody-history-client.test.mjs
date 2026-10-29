import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAccountClient} from '../lib/account-client.ts';
import {lotHistoryPath,parseLotHistory} from '../lib/custody-history.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';

const storage=()=>{const data=new Map();return {async getItem(key){return data.get(key)??null;},async setItem(key,value){data.set(key,value);},async removeItem(key){data.delete(key);}};};
test('historial por lote por HTTP: cliente comprador ve sus transferencias y operador las concilia sin billeteras',async()=>{
  const store=await createStore(''),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}`,password='Local-custody-history-test-2026';
  const client=()=>createAccountClient({api,storage:storage(),authStorage:storage(),uuid:randomUUID});
  try{
    const mine=await store.createMine({name:'Mina ficticia historial cliente',initialInventoryMg:{XAU:3000}});
    for(const [alias,role] of [['history_client_a','buyer'],['history_client_b','buyer'],['history_client_c','buyer'],['history_client_op','operator']])await store.createAccount({alias,password,role,mineId:mine.id});
    const a=client(),b=client(),c=client(),op=client();
    const alice=await a.login('history_client_a',password),bob=await b.login('history_client_b',password),operator=await op.login('history_client_op',password);
    await c.login('history_client_c',password);
    await a.submit('buy',{metal:'XAU',grams:'0.500'},'Compra ficticia');
    const offer=await a.submit('offer',{metal:'XAU',grams:'0.200',price:'140'},'Oferta ficticia');
    // Fill via the same HTTP account client used by the mobile app.
    await b.submit('market_buy',{sellerId:alice.account.id,offerId:offer.receipt.offer.id},'Compra a otra cuenta demo');
    const lots=await a.get('/api/demo/custody'),lotId=lots.lots[0].id;
    const ah=parseLotHistory(await a.get(lotHistoryPath(lotId)),lotId,false,alice.account.id);
    const bh=parseLotHistory(await b.get(lotHistoryPath(lotId)),lotId,false,bob.account.id);
    const oh=parseLotHistory(await op.get(lotHistoryPath(lotId)),lotId,true,operator.account.id);
    assert.equal(ah.items.find(event=>event.kind==='MARKET_TRANSFER').direction,'OUT');
    assert.equal(bh.items.find(event=>event.kind==='MARKET_TRANSFER').direction,'IN');
    assert.doesNotMatch(JSON.stringify(ah),/history_client_b|walletMinor|password|token/);
    assert.doesNotMatch(JSON.stringify(bh),/history_client_a|walletMinor|password|token/);
    const transfer=oh.items.find(event=>event.kind==='MARKET_TRANSFER');assert.equal(transfer.mg,200);assert.equal(transfer.account.id,alice.account.id);assert.equal(transfer.counterparty.id,bob.account.id);
    assert.doesNotMatch(JSON.stringify(oh),/walletMinor|balancesAfter|password|token/);
    await assert.rejects(c.get(lotHistoryPath(lotId)),error=>error.status===404);
    const again=parseLotHistory(await a.get(lotHistoryPath(lotId)),lotId,false,alice.account.id);
    assert.deepEqual(again,ah);assert.equal(oh.items.filter(event=>event.kind==='MARKET_TRANSFER').length,1);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
