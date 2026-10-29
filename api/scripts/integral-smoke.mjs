// Isolated synthetic mines only. Credentials stay in memory or an optional private
// snapshot outside Git; never print them or use the owner's shared demo account.
// node scripts/integral-smoke.mjs [smoke] [URL]
// node scripts/integral-smoke.mjs prepare|verify URL SNAPSHOT_OUTSIDE_GIT
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {lstat,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {dirname,parse,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const args=process.argv.slice(2),explicit=['smoke','prepare','verify'].includes(args[0]);
const phase=explicit?args.shift():'smoke';
const rawBase=args.shift()||'http://127.0.0.1:3000',snapshotPath=args.shift();
const metals=['XAU','XAG','XPT','XPD'];
const replayActions=new Set(['mine/stock','buy','sell','offer','cancel_offer','market_buy','delivery','cancel_delivery','delivery_accept','delivery_reject','mine/delivery_config','mine/delivery_quote','mine/delivery_transition']);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const originalReceipt=({replayed,...receipt})=>receipt;
let checks=0,stage='configuration';
function check(condition,message){checks++;assert.ok(condition,message);}
function same(actual,expected,message){check(isDeepStrictEqual(actual,expected),message);}
function pass(message){console.log(`PASS ${message}`);}
async function outsideGit(file){
  const inspect=async target=>{
    let directory=await realpath(dirname(resolve(target)));
    while(true){
      try{await stat(resolve(directory,'.git'));throw new Error('Snapshot must stay outside every Git checkout.');}
      catch(error){if(error.code!=='ENOENT')throw error;}
      if(directory===parse(directory).root)return;
      directory=dirname(directory);
    }
  };
  await inspect(file);
  // A symlink outside a checkout must not redirect a verification into Git.
  try{await inspect(await realpath(file));}catch(error){if(error.code!=='ENOENT')throw error;}
}

try{
  check(!args.length,'Unexpected arguments.');
  check(phase==='smoke'?!snapshotPath:Boolean(snapshotPath),'Use prepare|verify URL SNAPSHOT_OUTSIDE_GIT, or smoke URL.');
  const url=new URL(rawBase);
  check(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)),'HTTPS is required except for localhost.');
  check(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Use an API origin without credentials, path, query or fragment.');
  const base=url.origin;
  if(snapshotPath){
    await outsideGit(snapshotPath);
    if(phase==='prepare'){
      try{await lstat(snapshotPath);throw new Error('Refusing to overwrite an existing snapshot.');}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  const http=async(path,{token,admin=false,body,key,expected=200,method}={})=>{
    const response=await fetch(base+path,{
      method:method||(body===undefined?'GET':'POST'),signal:AbortSignal.timeout(20_000),redirect:'error',
      headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(admin?{'x-demo-admin-token':process.env.DEMO_ADMIN_TOKEN}:{ }),...(key?{'Idempotency-Key':key}:{ })},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    check((Array.isArray(expected)?expected:[expected]).includes(response.status),`Unexpected HTTP ${response.status} for ${path}.`);
    return {status:response.status,data:await response.json()};
  };
  const request=async(path,options)=>(await http(path,options)).data;
  stage='health';
  const health=await request('/health');
  check(health.ok===true&&health.demoOnly===true,'A healthy simulation API is required.');
  if(process.env.REQUIRE_POSTGRES==='true'||phase!=='smoke')check(health.mode==='postgres-demo','PostgreSQL demo mode is required.');
  let users={},commands=[];
  const capture=async()=>{
    const result={states:{},custodies:{},mines:{},deliveries:{}};
    for(const [name,user] of Object.entries(users)){
      const me=await request('/api/demo/accounts/me',{token:user.token});
      check(me.demoOnly===true&&me.account.id===user.account.id&&me.account.role===user.account.role&&me.mine.id===user.mineId,'Fixture identity changed.');
      if(user.account.role==='buyer'){
        result.states[name]=await request('/api/demo/state',{token:user.token});
        result.custodies[name]=await request('/api/demo/custody',{token:user.token});
        result.deliveries[name]=await request('/api/demo/deliveries',{token:user.token});
      }else{
        result.mines[name]=await request('/api/demo/mine/summary',{token:user.token});
        result.custodies[name]=await request('/api/demo/mine/custody',{token:user.token});
        result.deliveries[name]=await request('/api/demo/mine/deliveries',{token:user.token});
      }
    }
    return result;
  };
  const replayAll=async()=>{
    for(const command of commands){
      const result=await request(`/api/demo/${command.action}`,{token:users[command.user].token,body:command.body,key:command.key});
      check(result.receipt.replayed===true,'An original command was not recognized as replay.');
      same(originalReceipt(result.receipt),command.receipt,'Replay changed an original receipt.');
    }
  };
  if(phase==='verify'){
    stage='private snapshot validation';
    const snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));
    check(snapshot.format==='openminerals.integral-smoke.snapshot'&&snapshot.version===2&&snapshot.base===base,'Snapshot format or API origin mismatch.');
    check(snapshot.users&&Array.isArray(snapshot.commands)&&snapshot.data&&snapshot.dataHash===hash(snapshot.data),'Incomplete snapshot.');
    users=snapshot.users;commands=snapshot.commands;
    check(Object.keys(users).length===6,'Expected six isolated fixture accounts.');
    for(const user of Object.values(users))check(/^[A-Za-z0-9_-]{43}$/.test(user.token)&&validId(user.account?.id)&&['buyer','operator'].includes(user.account?.role)&&validId(user.mineId),'Invalid fixture identity.');
    for(const command of commands)check(Object.hasOwn(users,command.user)&&replayActions.has(command.action)&&validId(command.key)&&command.body&&typeof command.body==='object'&&!Array.isArray(command.body)&&command.receipt?.id===command.key,'Invalid replay command.');
    stage='state and custody after external restart';
    same(await capture(),snapshot.data,'Fixture states, receipts, mine summaries or custody changed since prepare.');
    await replayAll();
    same(await capture(),snapshot.data,'Replays changed persisted state or custody.');
    pass('private fixture identities, states, receipts, custody, mine summaries and all replays preserved');
    console.log('A restart must be confirmed separately in Railway; this script does not perform or prove it.');
  }else{
    check(Boolean(process.env.DEMO_ADMIN_TOKEN),'DEMO_ADMIN_TOKEN is required in the process environment.');
    const tag=randomUUID().replaceAll('-','').slice(0,18);
    stage='isolated mines and accounts';
    const initialInventoryMg={XAU:1000,XAG:0,XPT:0,XPD:0};
    const mine=await request('/api/demo/admin/mines',{admin:true,body:{name:`Integral DEMO ${tag}`,initialInventoryMg},expected:201});
    const otherMine=await request('/api/demo/admin/mines',{admin:true,body:{name:`Isolation DEMO ${tag}`,initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}},expected:201});
    for(const [name,role,mineId] of [['seller','buyer',mine.id],['a','buyer',mine.id],['b','buyer',mine.id],['op','operator',mine.id],['otherBuyer','buyer',otherMine.id],['otherOp','operator',otherMine.id]]){
      const alias=`int_${tag}_${name.toLowerCase()}`,password=`Demo-${randomBytes(24).toString('base64url')}`;
      const created=await request('/api/demo/admin/accounts',{admin:true,body:{alias,password,role,mineId},expected:201});
      const login=await request('/api/demo/accounts/login',{body:{alias,password}});
      check(login.demoOnly===true&&login.account.id===created.account.id&&login.account.role===role&&login.mine.id===mineId,'Fixture account provisioning failed.');
      users[name]={token:login.token,account:login.account,mineId};
    }
    const get=(name,path)=>request(`/api/demo/${path}`,{token:users[name].token});
    const mutate=async(name,action,body,key=randomUUID())=>{
      const result=await request(`/api/demo/${action}`,{token:users[name].token,body,key});
      check(result.receipt?.id===key&&result.receipt.demoOnly===true&&result.receipt.status==='COMPLETED','Incomplete mutation receipt.');
      if(!result.receipt.replayed)commands.push({user:name,action,body,key,receipt:originalReceipt(result.receipt)});
      return result;
    };
    const reject=async(name,action,body,status=403,key=randomUUID())=>request(`/api/demo/${action}`,{token:users[name]?.token,body,key,expected:status});
    await request('/api/demo/custody',{expected:401});
    await get('op','accounts/me');
    await request('/api/demo/mine/custody',{token:users.a.token,expected:403});
    await request('/api/demo/marketplace',{token:users.op.token,expected:403});
    await reject('a','mine/stock',{metal:'XAU',grams:'1.000',reason:'Unauthorized fixture'});
    await reject('op','buy',{metal:'XAU',grams:'0.100'});
    pass('two new isolated mines, four buyers, two operators and role enforcement');

    stage='documented stock and custody';
    const stockBody={metal:'XAU',grams:'2.000',reason:'Integral synthetic stock',purityBps:'9990',location:'Fictional integral vault',documentTitle:'Integral DEMO record',documentContent:'Synthetic text only; no metal, custody, identity or legal value.'};
    const stockKey=randomUUID(),stock=await mutate('op','mine/stock',stockBody,stockKey);
    const operatorCustody=await get('op','mine/custody'),lot=operatorCustody.lots.find(item=>item.id===stock.receipt.lotId);
    check(lot?.demoOnly===true&&lot.weightMg===2000&&lot.purityBps===9990&&lot.location.startsWith('DEMO · '),'Documented stock lot is incorrect.');
    check(lot.documents.length===1&&lot.documents[0].title===stockBody.documentTitle&&lot.documents[0].content===stockBody.documentContent&&lot.documents[0].demoOnly===true,'Stock document is missing or altered.');
    check(operatorCustody.totals.XAU.weightMg===3000&&operatorCustody.totals.XAU.allocatedMg===0&&operatorCustody.totals.XAU.availableMg===3000,'Stock supply does not reconcile.');
    const stockReplay=await mutate('op','mine/stock',stockBody,stockKey);
    check(stockReplay.receipt.replayed===true,'Stock replay was not recognized.');
    same(originalReceipt(stockReplay.receipt),stock.receipt,'Stock replay changed its receipt.');
    await reject('op','mine/stock',{...stockBody,purityBps:'9980'},422,stockKey);
    same(await get('op','mine/custody'),operatorCustody,'Altered stock replay changed custody.');
    pass('stock metadata, documents, lot capacity and immutable replay');

    stage='buyer custody and certificate privacy';
    const purchase=await mutate('seller','buy',{metal:'XAU',grams:'1.500'});
    const sellerCustody=await get('seller','custody'),firstLot=sellerCustody.lots.find(item=>item.id!==lot.id);
    check(purchase.receipt.certificateIds.length===2&&sellerCustody.allocations.length===2,'Purchase must span the two source lots.');
    const certificateId=sellerCustody.allocations.find(item=>item.lotId===firstLot.id).certificateId;
    const certificate=await get('seller',`certificates/${certificateId}`);
    check(certificate.account.id===users.seller.account.id&&certificate.issuedMg===1000&&certificate.status==='ACTIVE'&&certificate.demoOnly===true,'Buyer certificate is invalid.');
    for(const name of ['a','b','otherBuyer','otherOp'])await request(`/api/demo/certificates/${certificateId}`,{token:users[name].token,expected:404});
    check((await get('op',`certificates/${certificateId}`)).account.id===users.seller.account.id,'Mine operator cannot inspect the authorized certificate.');
    check((await get('a','custody')).allocations.length===0,'Another buyer received private allocations.');
    pass('two-lot allocation, certificate ownership and cross-mine privacy');

    stage='priced offers and reservation protection';
    const offered=await mutate('seller','offer',{metal:'XAU',grams:'1.000',price:'140.00'}),offerId=offered.receipt.offer.id;
    const reserved=await mutate('seller','offer',{metal:'XAU',grams:'0.200',price:'150.00'});
    await reject('seller','sell',{metal:'XAU',grams:'0.400'},422);
    const catalog=await get('a','marketplace'),entry=catalog.offers.find(item=>item.seller.id===users.seller.account.id&&item.id===offerId);
    check(entry?.canBuy===true&&entry.baseMinor===14000&&entry.feeMinor===168&&entry.sellerNetMinor===13832,'Marketplace quote or seller fee is incorrect.');
    check(!JSON.stringify(catalog).includes('walletMinor')&&!JSON.stringify(catalog).includes('balancesAfter'),'Catalog exposed private wallet snapshots.');
    check((await get('seller','marketplace')).offers.every(item=>!item.canBuy&&item.isOwn),'Own offers must not be purchasable.');
    await reject('seller','market_buy',{sellerId:users.seller.account.id,offerId},422);
    await reject('otherBuyer','market_buy',{sellerId:users.seller.account.id,offerId},404);
    same((await get('otherBuyer','marketplace')).offers,[],'Another mine received the offers.');
    await reject('a','market_buy',{sellerId:users.seller.account.id,offerId,price:'0.01'},400);
    pass('priced offers, independent reservations, own-offer rejection and private catalog');

    stage='two buyers racing to fill one offer';
    const beforeSeller=await get('seller','state'),beforeA=await get('a','state'),beforeB=await get('b','state'),beforeMine=await get('op','mine/summary');
    const raceBody={sellerId:users.seller.account.id,offerId},raceKey=randomUUID();
    const outcomes=await Promise.all(['a','b'].map(name=>http('/api/demo/market_buy',{token:users[name].token,body:raceBody,key:raceKey,expected:[200,422]})));
    check(outcomes.filter(item=>item.status===200).length===1&&outcomes.filter(item=>item.status===422).length===1,'The offer was not settled exactly once.');
    const win=outcomes.findIndex(item=>item.status===200),winner=['a','b'][win],loser=['a','b'][1-win],trade=outcomes[win].data;
    check(outcomes[1-win].data.code==='OFFER_UNAVAILABLE','Competing purchase failed for an unexpected reason.');
    check(trade.receipt.id===raceKey&&trade.receipt.action==='market_buy','Winning marketplace receipt is invalid.');
    commands.push({user:winner,action:'market_buy',body:raceBody,key:raceKey,receipt:originalReceipt(trade.receipt)});
    const afterSeller=await get('seller','state'),afterA=await get('a','state'),afterB=await get('b','state'),afterMine=await get('op','mine/summary');
    const sold=Object.values(afterSeller.receipts).find(item=>item.action==='market_sell'&&item.tradeId===trade.receipt.tradeId);
    check(sold?.outputMinor===13832&&sold.feeMinor===168&&trade.receipt.totalMinor===14000&&trade.receipt.feeMinor===0,'Settlement amounts do not match the quote.');
    check(beforeSeller.walletMinor.USDT+beforeA.walletMinor.USDT+beforeB.walletMinor.USDT===afterSeller.walletMinor.USDT+afterA.walletMinor.USDT+afterB.walletMinor.USDT+168,'USDT and the single seller fee are not conserved.');
    same(loser==='a'?afterA:afterB,loser==='a'?beforeA:beforeB,'Losing buyer state changed.');
    check(afterSeller.holdingsMg.XAU===500&&(winner==='a'?afterA:afterB).holdingsMg.XAU===1000,'Metal transfer amounts are incorrect.');
    check(afterSeller.offers.find(item=>item.id===offerId).status==='FILLED'&&afterSeller.offers.find(item=>item.id===reserved.receipt.offer.id).status==='OPEN','Settlement changed the wrong reservation.');
    same(afterMine.inventoryMg,beforeMine.inventoryMg,'Peer transfer changed free mine inventory.');
    same(afterMine.totalSupplyMg,beforeMine.totalSupplyMg,'Peer transfer changed total mine supply.');
    check(afterMine.transactionCount===beforeMine.transactionCount+1&&afterMine.demoFeesCollectedMinor===beforeMine.demoFeesCollectedMinor+168&&afterMine.reservedMg.XAU===200,'Trade count, fee or remaining reservation is incorrect.');
    const winnerCustody=await get(winner,'custody');
    check(winnerCustody.allocations.length===1&&winnerCustody.allocations[0].lotId===firstLot.id&&winnerCustody.allocations[0].mg===1000,'Peer transfer did not preserve the exact seller source lot.');
    check((await get('seller',`certificates/${certificateId}`)).status==='RELEASED','Seller source certificate was not released.');
    const winnerCertificate=await get(winner,`certificates/${trade.receipt.certificateIds[0]}`);
    check(winnerCertificate.lot.id===firstLot.id&&winnerCertificate.allocatedMg===1000,'New buyer certificate lost source provenance.');
    pass('concurrent settlement exactly once, USDT/metal conservation, exact source lot and certificates');

    stage='receipt privacy, altered replay and cancellation';
    same(await get(winner,`receipts/${trade.receipt.id}`),trade.receipt,'Buyer historical receipt changed.');
    same(await get('seller',`receipts/${sold.id}`),sold,'Seller historical receipt changed.');
    await request(`/api/demo/receipts/${trade.receipt.id}`,{token:users[loser].token,expected:404});
    await request(`/api/demo/receipts/${sold.id}`,{token:users[winner].token,expected:404});
    for(const [name,receipt] of [[winner,trade.receipt],['seller',sold]]){
      const viewed=await get('op',`mine/receipts/${users[name].account.id}/${receipt.id}`);
      check(viewed.operatorView===true&&!Object.hasOwn(viewed,'balancesAfter'),'Operator received private receipt balances.');
    }
    const stable=await capture();
    const replays=await Promise.all([1,2].map(()=>request('/api/demo/market_buy',{token:users[winner].token,body:raceBody,key:raceKey})));
    for(const result of replays){check(result.receipt.replayed===true,'Concurrent replay was not recognized.');same(originalReceipt(result.receipt),trade.receipt,'Concurrent replay changed its receipt.');}
    await reject(winner,'market_buy',{...raceBody,offerId:reserved.receipt.offer.id},422,raceKey);
    await reject('seller','cancel_offer',{offerId},422);
    await reject('seller','sell',{metal:'XAU',grams:'0.400'},422);
    same(await capture(),stable,'Rejected or replayed commands changed account state, custody or summaries.');
    await mutate('seller','cancel_offer',{offerId:reserved.receipt.offer.id});
    await mutate('seller','sell',{metal:'XAU',grams:'0.100'});
    pass('private immutable receipts, original-key recovery, altered replay rejection and reservation cancellation');

    stage='final reconciliation';
    let final=await capture();const summary=final.mines.op,allStates=['seller','a','b'].map(name=>final.states[name]);
    check(summary.reconciled===true&&summary.accountCount===3&&summary.transactionCount===3&&summary.demoFeesCollectedMinor===404,'Final mine metrics do not reconcile.');
    for(const metal of metals)check(summary.inventoryMg[metal]+summary.allocatedMg[metal]===summary.totalSupplyMg[metal]&&summary.reservedMg[metal]<=summary.allocatedMg[metal],'Final inventory conservation failed.');
    check(summary.inventoryMg.XAU===1600&&summary.allocatedMg.XAU===1400&&summary.totalSupplyMg.XAU===3000&&summary.reservedMg.XAU===0,'Final gold quantities are incorrect.');
    for(const lot of final.custodies.op.lots)check(lot.allocatedMg+lot.availableMg===lot.weightMg&&lot.availableMg>=0,'Final lot capacity failed.');
    const fees=allStates.flatMap(state=>Object.values(state.receipts)).filter(receipt=>['buy','sell','market_sell'].includes(receipt.action)).reduce((sum,receipt)=>sum+(receipt.feeMinor||0),0);
    check(fees===summary.demoFeesCollectedMinor,'Receipts and administrative fee total differ.');
    check(summary.operations.every(item=>item.receipt.operatorView===true&&!Object.hasOwn(item.receipt,'balancesAfter')),'Summary exposed private balances.');
    await replayAll();same(await capture(),final,'Final replay duplicated a mutation or changed custody.');
    pass('mine totals, lot capacity, receipt fees and all operation replays reconciled');

    stage='delivery policies and fictional requirements';
    const policyBody={jurisdiction:'DEMO_LOCAL',label:'Jurisdiccion integral DEMO',taxBps:'500',service:'2.00',preparation:'3.00',transport:'5.00',insuranceBps:'100',quoteValidityHours:'24',requirements:'Confirm only fictional delivery\nDo not provide a real identity or address',reason:'Isolated integral delivery policy'};
    const policy=await mutate('op','mine/delivery_config',policyBody);
    check(policy.receipt.action==='delivery_config'&&policy.receipt.policyVersion===2&&policy.receipt.actor.id===users.op.account.id,'Delivery policy command receipt is incorrect.');
    const policies=await get(winner,'deliveries'),operatorPolicies=await get('op','mine/deliveries'),localPolicy=policies.policies.jurisdictions.find(item=>item.id==='DEMO_LOCAL');
    check(policies.demoOnly===true&&policies.view==='buyer'&&policies.policies.jurisdictions.length===3&&policies.policies.version===2&&policies.policies.quoteValidityHours===24,'Delivery policy migration or version is incorrect.');
    check(localPolicy.taxBps===500&&localPolicy.insuranceBps===100&&localPolicy.serviceMinor===200&&localPolicy.preparationMinor===300&&localPolicy.transportMinor===500&&localPolicy.demoOnly===true,'Configured fictional delivery costs differ.');
    same(localPolicy.requirements,policyBody.requirements.split('\n'),'Fictional requirements differ from configuration.');
    check(policies.audit.length===0&&operatorPolicies.audit.length===1,'Delivery policy audit was not isolated to the operator.');
    await reject(winner,'mine/delivery_config',policyBody,403);
    await request('/api/demo/mine/deliveries',{token:users[winner].token,expected:403});
    await request('/api/demo/deliveries',{token:users.op.token,expected:403});
    pass('versioned fictional delivery policies, requirements, costs and operator permissions');

    stage='delivery request, quote and single buyer charge';
    const delivery=await mutate(winner,'delivery',{metal:'XAU',grams:'0.200',jurisdiction:'DEMO_LOCAL'}),deliveryId=delivery.receipt.delivery.id;
    check(delivery.receipt.delivery.status==='PENDING_QUOTE','Delivery request did not reserve the metal.');
    await reject(winner,'sell',{metal:'XAU',grams:'0.900'},422);
    const quoted=await mutate('op','mine/delivery_quote',{buyerId:users[winner].account.id,deliveryId,jurisdiction:'DEMO_LOCAL'}),quote=quoted.receipt.quote;
    check(quoted.receipt.deliveryStatus==='QUOTED'&&quote.demoOnly===true&&quote.currency==='USDT'&&quote.policyVersion===2,'Delivery quote is incomplete.');
    check(quote.metalValueMinor===2900&&quote.insuranceMinor===29&&quote.subtotalMinor===1029&&quote.taxMinor===52&&quote.totalMinor===1081,'Delivery quote rounding or tax/insurance basis is incorrect.');
    check(Date.parse(quote.expiresAt)-Date.parse(quote.createdAt)===24*3_600_000,'Delivery quote expiry differs from policy.');
    same(quote.requirements,localPolicy.requirements,'Issued quote lost its fictional requirements.');
    same(await get('op',`mine/commands/${quoted.receipt.id}`),quoted.receipt,'Operator command lookup changed its original receipt.');
    check(!Object.hasOwn(quoted.receipt,'balancesAfter'),'Operator quote exposed a buyer wallet.');
    await request(`/api/demo/mine/commands/${quoted.receipt.id}`,{token:users.otherOp.token,expected:404});
    await reject('otherOp','mine/delivery_quote',{buyerId:users[winner].account.id,deliveryId,jurisdiction:'DEMO_LOCAL'},404);
    await reject(loser,'delivery_accept',{deliveryId,quoteId:quote.id},404);
    const beforeAcceptance=await get(winner,'state');
    await reject(winner,'delivery_accept',{deliveryId,quoteId:'quote-not-the-current-quote'},422);
    same(await get(winner,'state'),beforeAcceptance,'Stale quote acceptance changed the buyer state.');
    const accepted=await mutate(winner,'delivery_accept',{deliveryId,quoteId:quote.id});
    check(accepted.receipt.deliveryStatus==='APPROVED'&&accepted.receipt.totalMinor===1081&&accepted.receipt.requirementsAcknowledged===true,'Buyer acceptance receipt is incorrect.');
    check(accepted.state.walletMinor.USDT===beforeAcceptance.walletMinor.USDT-1081&&accepted.receipt.balancesAfter.walletMinor.USDT===accepted.state.walletMinor.USDT,'Delivery costs were not charged exactly once.');
    await reject(winner,'cancel_delivery',{deliveryId},422);
    await reject(winner,'delivery_reject',{deliveryId},422);
    await reject(winner,'sell',{metal:'XAU',grams:'0.900'},422);
    await reject('op','mine/delivery_quote',{buyerId:users[winner].account.id,deliveryId,jurisdiction:'DEMO_LOCAL'},422);
    const acceptedMine=await get('op','mine/summary');
    check(acceptedMine.reservedMg.XAU===200&&acceptedMine.deliveriesPending===1,'An approved delivery lost its active reservation.');
    pass('delivery reservation, quote details and expiry, stale quote rejection and single buyer payment');

    stage='delivery state machine and active lot supply';
    const beforeDispatch=await get('op','mine/summary');
    await reject('op','mine/delivery_transition',{buyerId:users[winner].account.id,deliveryId,status:'DELIVERED_DEMO',reason:'Invalid skipped-state fixture'},422);
    const transitions=[];
    for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO']){
      const transition=await mutate('op','mine/delivery_transition',{buyerId:users[winner].account.id,deliveryId,status,reason:`Synthetic integral transition ${status}`});
      check(transition.receipt.deliveryStatus===status&&transition.receipt.actor.id===users.op.account.id&&!Object.hasOwn(transition.receipt,'balancesAfter'),'Delivery transition receipt is invalid or private.');
      check((await get(winner,'state')).walletMinor.USDT===accepted.state.walletMinor.USDT,'Operator transition charged the buyer again.');
      transitions.push(transition.receipt);
    }
    const afterDelivery=await get(winner,'state'),afterDispatch=await get('op','mine/summary'),delivered=afterDelivery.custodyRequests.find(item=>item.id===deliveryId);
    check(delivered.status==='DELIVERED_DEMO'&&delivered.paidMinor===1081&&delivered.acceptedQuoteId===quote.id&&afterDelivery.holdingsMg.XAU===800,'Completed delivery did not retain its payment or remove the allocated grams.');
    same(delivered.deliveredLots,[{lotId:firstLot.id,mg:200}],'Completed delivery changed source provenance.');
    same(afterDispatch.inventoryMg,beforeDispatch.inventoryMg,'Simulated delivery incorrectly returned metal to free inventory.');
    check(afterDispatch.totalSupplyMg.XAU===beforeDispatch.totalSupplyMg.XAU-200&&afterDispatch.allocatedMg.XAU===beforeDispatch.allocatedMg.XAU-200&&afterDispatch.reservedMg.XAU===0&&afterDispatch.deliveriesPending===0,'Active mine supply and reservations did not decrease once.');
    const deliveredCustody=await get('op','mine/custody'),deliveredLot=deliveredCustody.lots.find(item=>item.id===firstLot.id);
    check(deliveredLot.weightMg===1000&&deliveredLot.deliveredMg===200&&deliveredLot.activeWeightMg===800&&deliveredLot.allocatedMg===800&&deliveredLot.availableMg===0,'Delivered lot lost its historical or active weight.');
    check(deliveredCustody.totals.XAU.weightMg===3000&&deliveredCustody.totals.XAU.deliveredMg===200&&deliveredCustody.totals.XAU.activeWeightMg===2800,'Historical and active custody totals differ.');
    const reducedCertificate=await get(winner,`certificates/${trade.receipt.certificateIds[0]}`);
    check(reducedCertificate.issuedMg===1000&&reducedCertificate.allocatedMg===800&&reducedCertificate.status==='PARTIALLY_RELEASED','Delivery rewrote or failed to release the buyer certificate.');
    same(await get(winner,`receipts/${accepted.receipt.id}`),accepted.receipt,'Later delivery states rewrote the original acceptance receipt.');
    same(await get('op',`mine/commands/${transitions[0].id}`),transitions[0],'Later states rewrote an operator transition receipt.');
    await reject('op','mine/delivery_transition',{buyerId:users[winner].account.id,deliveryId,status:'DELIVERED_DEMO',reason:'Duplicate final transition fixture'},422);
    pass('ordered simulated dispatch, no repeated charge, active supply reduction and historical lot/certificate preservation');

    stage='delivery cancellation and rejection before payment';
    const cancellation=await mutate(winner,'delivery',{metal:'XAU',grams:'0.100',jurisdiction:'DEMO_LOCAL'});
    await mutate('op','mine/delivery_quote',{buyerId:users[winner].account.id,deliveryId:cancellation.receipt.delivery.id,jurisdiction:'DEMO_LOCAL'});
    const cancelled=await mutate(winner,'cancel_delivery',{deliveryId:cancellation.receipt.delivery.id});
    check(cancelled.state.custodyRequests.find(item=>item.id===cancellation.receipt.delivery.id).status==='CANCELLED','Quoted request was not cancelled.');
    const buyerRejection=await mutate('seller','delivery',{metal:'XAU',grams:'0.100',jurisdiction:'DEMO_REGIONAL'});
    const rejected=await mutate('seller','delivery_reject',{deliveryId:buyerRejection.receipt.delivery.id});
    check(rejected.receipt.deliveryStatus==='REJECTED','Buyer could not reject an unpaid request.');
    const operatorRejection=await mutate('seller','delivery',{metal:'XAU',grams:'0.100',jurisdiction:'DEMO_INTERNATIONAL'});
    const rejectedByOperator=await mutate('op','mine/delivery_transition',{buyerId:users.seller.account.id,deliveryId:operatorRejection.receipt.delivery.id,status:'REJECTED',reason:'Fictional operator rejection'});
    check(rejectedByOperator.receipt.deliveryStatus==='REJECTED','Operator could not reject a pending request.');
    check((await get(winner,'state')).walletMinor.USDT===accepted.state.walletMinor.USDT&&(await get('seller','state')).walletMinor.USDT===final.states.seller.walletMinor.USDT,'Unpaid cancellation or rejection charged a wallet.');
    const finalDeliverySummary=await get('op','mine/summary');
    check(finalDeliverySummary.reservedMg.XAU===0&&finalDeliverySummary.deliveriesPending===0&&finalDeliverySummary.inventoryMg.XAU===1600&&finalDeliverySummary.allocatedMg.XAU===1200&&finalDeliverySummary.totalSupplyMg.XAU===2800,'Cancelled and rejected deliveries did not release reservations consistently.');
    const ownDeliveries=await get(winner,'deliveries');
    check(ownDeliveries.requests.every(item=>item.account.id===users[winner].account.id)&&ownDeliveries.audit.length===0,'Buyer delivery view exposed another account or operator audit.');
    for(const receipt of [quoted.receipt,...transitions,rejectedByOperator.receipt])check(!Object.hasOwn(receipt,'balancesAfter'),'Operator command includes private wallet balances.');
    final=await capture();
    for(const lot of final.custodies.op.lots)check(lot.allocatedMg+lot.availableMg===lot.activeWeightMg&&lot.activeWeightMg+lot.deliveredMg===lot.weightMg,'Final delivered lot reconciliation failed.');
    for(const metal of metals)check(final.mines.op.inventoryMg[metal]+final.mines.op.allocatedMg[metal]===final.mines.op.totalSupplyMg[metal],'Final active mine reconciliation failed.');
    await replayAll();same(await capture(),final,'Delivery replay duplicated a charge, transition, supply decrement or receipt.');
    pass('unpaid cancellations/rejections, private delivery views and every original delivery command replay');
    if(phase==='prepare'){
      const snapshot={format:'openminerals.integral-smoke.snapshot',version:2,base,preparedAt:new Date().toISOString(),users,commands,data:final,dataHash:hash(final)};
      await writeFile(snapshotPath,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
      pass('private snapshot created outside Git; it contains synthetic auth tokens and must not be published');
      console.log('Confirm the API restart separately, then run verify with the same origin and snapshot.');
    }else{
      for(const user of Object.values(users)){
        await request('/api/demo/accounts/logout',{token:user.token,method:'POST'});
        await request('/api/demo/accounts/me',{token:user.token,expected:401});
      }
      pass('synthetic authentication sessions revoked after smoke');
    }
  }
  console.log(`INTEGRAL ${phase.toUpperCase()} PASSED · ${checks} checks · ${base} · ${health.mode} · isolated fixtures only`);
}catch(error){
  // Assertions use fixed messages: never dump HTTP bodies, tokens or snapshots.
  console.error(`INTEGRAL ${phase.toUpperCase()} FAILED at ${stage}: ${error.message}`);
  process.exitCode=1;
}
