import {randomUUID} from 'node:crypto';
import {getCreateAddress,concat,AbiCoder} from 'ethers';
import {DEFAULT_MINE_ID} from '../shared-mine.js';
import {walletLinkServices} from './wallet-link.js';
import {reconciliationService} from './sync.js';
import {backingTree} from './backing.js';
import {CHAIN_ID,CHAIN_HEX,EXPLORER,artifact,abi,address,fail,copy,hash,sha,operationKey,units,uuid,txHash,hex,sourceKey,rpcPort,network,call,assertContract,ZERO} from './common.js';
export function testnetServices(adapter,{testnetEnabled=false,testnetOrigin='',testnetRpc,testnetConfirmations=3,now=Date.now,localSimulation=false}={},prepareCustody){
  let origin='';
  if(testnetEnabled){const url=new URL(testnetOrigin);fail(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&!['openminerals-api-demo.up.railway.app','openminerals-market-api-market-reference.up.railway.app'].includes(url.hostname),'Configura origen HTTPS aislado de testnet.');origin=url.origin;}
  fail(Number.isInteger(testnetConfirmations)&&testnetConfirmations>=2&&testnetConfirmations<=100);
  const rpc=rpcPort({provider:testnetRpc}),required=()=>fail(testnetEnabled,'Blockchain DEMO desactivada.',503,'TESTNET_DISABLED');
  async function context(tx,accountId,sessionHash,{operator=false}={}){
    required();const first=await tx.account(accountId);fail(first,'Cuenta no disponible.',401);
    if(operator)fail(first.role==='operator','Requiere operador DEMO.',403);
    let mine=await tx.mine(first.mineId,true);const account=await tx.account(accountId,true);
    if(sessionHash){const session=await tx.auth(sessionHash);fail(session?.accountId===accountId&&Date.parse(session.expiresAt)>now(),'Sesión vencida.',401);}
    mine=await prepareCustody(tx,mine);await tx.chainLock();return {account,mine};
  }
  const env={adapter,context,required,now,origin,rpc,confirmations:testnetConfirmations,localSimulation};
  const reconcile=reconciliationService(env);
  const active=op=>['AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','REORGED','NEEDS_RECONCILIATION'].includes(op.status);
  async function wallet(tx,accountId){const link=await tx.chainGet('wallet:'+accountId);fail(link,'Vincula primero tu dirección mediante firma.',409,'WALLET_NOT_LINKED');return link;}
  async function configured(tx){const state=await tx.chainGet('chain:state');fail(state?.contract&&state.status==='READY','Despliega/confirma el contrato y concilia la testnet.',409,'CHAIN_NOT_READY');return state;}
  const participant=async(state,addr)=>{fail((await call(rpc,state.contract,'participants',[addr]))[0],'La dirección no está habilitada en el contrato DEMO.',409,'PARTICIPANT_REQUIRED');};
  return {
    ...walletLinkServices(env),testnetReconcile:reconcile,
    async freezeTestnetPool(accountId,sessionHash,input){
      fail(input.acknowledgement==='DEMO_ONLY_ISOLATED_MINE','Confirma el aislamiento del pool DEMO.');
      return adapter.tx(async tx=>{
        const {account,mine}=await context(tx,accountId,sessionHash,{operator:true});fail(mine.id!==DEFAULT_MINE_ID,'La mina compartida no puede reservarse para testnet.',403);
        const pool=await tx.chainGet('chain:pool');fail(!pool||pool.mineId===mine.id,'Este entorno ya reservó otro pool DEMO.',409);
        const existing=await tx.chainGet('backing:'+mine.id);if(existing)return {demoOnly:true,backing:existing,replayed:true};
        const accounts=await tx.accountsForMine(mine.id);
        fail(mine.custody.lots.some(lot=>lot.weightMg>lot.deliveredMg)&&mine.custody.allocations.every(item=>item.mg===0)&&accounts.every(item=>Object.values(item.state.holdingsMg).every(value=>value===0))&&!(mine.custody.reservations?.items??[]).some(item=>item.status==='ACTIVE'),'El pool debe tener inventario DEMO sin posiciones ni reservas comerciales.',409);
        const backing={mineId:mine.id,at:new Date(now()).toISOString(),actorId:account.id,unit:'mg',massBasis:'gross-lot-mass',demoOnly:true,...backingTree(mine.custody.lots.filter(lot=>lot.weightMg>lot.deliveredMg).map(lot=>({lotId:lot.id,sourceKey:sourceKey(mine,lot),tokenId:BigInt(sourceKey(mine,lot)).toString(),metal:lot.metal,purityBps:lot.purityBps,capGrossMg:lot.weightMg-lot.deliveredMg,documentsHash:hash(lot.documents),demoOnly:true})))};
        mine.testnetBackingLock={at:backing.at,demoOnly:true};await tx.saveMine(mine);await tx.chainPut('backing:'+mine.id,backing);await tx.chainPut('chain:pool',{mineId:mine.id});return {demoOnly:true,backing};
      });
    },
    async getTestnetState(accountId,sessionHash){
      return adapter.tx(async tx=>{
        const {account,mine}=await context(tx,accountId,sessionHash),link=await tx.chainGet('wallet:'+accountId),state=await tx.chainGet('chain:state'),backing=await tx.chainGet('backing:'+mine.id);
        const members=(await tx.accountsForMine(mine.id)),participants=[];
        for(const member of members){const linked=await tx.chainGet('wallet:'+member.id);if(linked)participants.push({accountId:member.id,alias:member.alias,address:linked.address,enabled:!!state?.participants?.[linked.address]});}
        const operations=(await tx.chainScan('op:')).filter(op=>op.mineId===mine.id&&(account.role==='operator'||op.accountId===accountId||op.toAccountId===accountId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
        const balances=link?Object.entries(state?.balances?.[link.address]??{}).map(([tokenId,value])=>({tokenId,units:value,unit:'mg',massBasis:'gross-lot-mass',demoOnly:true})):[];
        const events=(state?.events??[]).filter(event=>link&&(event.from===link.address||event.to===link.address)).slice(-100).reverse();
        const explorer=hashValue=>!localSimulation&&hashValue?EXPLORER+'/tx/'+hashValue:null;
        return {demoOnly:true,execution:localSimulation?'local-simulated':'base-sepolia',chainId:CHAIN_ID,wallet:link??null,contract:state?.contract??null,contractExplorer:!localSimulation&&state?.contract?EXPLORER+'/address/'+state.contract:null,
          backing:backing??null,participants,balances,operations:operations.map(op=>({...copy(op),explorer:explorer(op.hash)})),events:events.map(event=>({...event,explorer:explorer(event.transactionHash)})),
          reconciliation:{status:state?.status??'NOT_DEPLOYED',indexedBlock:state?.indexedBlock??null,indexedHash:state?.indexedHash??null,confirmations:testnetConfirmations,problems:state?.problems??[]},disclaimer:'TESTNET DEMO · Sin metales físicos, propiedad legal, dinero o USDT reales.'};
      });
    },
    async prepareTestnetOperation(accountId,sessionHash,input,requestId){
      fail(typeof requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(requestId));
      fail(['deploy','participant','register','issue','transfer','cancel'].includes(input.kind));
      if(['participant','issue','transfer'].includes(input.kind))fail(typeof input.toAccountId==='string'&&/^account-[a-f0-9-]{36}$/.test(input.toAccountId));
      if(['register','issue','transfer','cancel'].includes(input.kind))fail(typeof input.lotId==='string'&&/^lot-[a-f0-9]{32}$/.test(input.lotId));
      const allowed={deploy:['kind'],participant:['kind','toAccountId'],register:['kind','lotId'],issue:['kind','lotId','toAccountId','units'],transfer:['kind','lotId','toAccountId','units'],cancel:['kind','lotId','units']};
      fail(Object.keys(input).every(key=>allowed[input.kind].includes(key)));
      return adapter.tx(async tx=>{
        const {account,mine}=await context(tx,accountId,sessionHash),link=await wallet(tx,accountId),signature=hash(input),key='request:'+accountId+':'+requestId,old=await tx.chainGet(key);
        if(old){fail(old.signature===signature,'Identificador reutilizado con otro intento.',409);return {demoOnly:true,operation:await tx.chainGet('op:'+old.id),replayed:true};}
        const backing=await tx.chainGet('backing:'+mine.id);fail(backing&&mine.testnetBackingLock,'Reserva un pool DEMO aislado.',409);
        const operations=await tx.chainScan('op:');fail(operations.filter(op=>op.accountId===accountId&&active(op)).length<10,'Demasiadas operaciones pendientes.',429);
        await network(rpc);const id=randomUUID(),deadline=Math.floor(now()/1000)+900,opId=operationKey(id),base={chainId:CHAIN_HEX,from:link.address,value:'0x0'};
        let unsigned,state,lot,toAccount,toAddress;
        if(['deploy','participant','register','issue'].includes(input.kind))fail(account.role==='operator','Solo el operador emite o configura.',403);
        if(input.toAccountId){toAccount=await tx.account(input.toAccountId);fail(toAccount&&toAccount.mineId===mine.id,'Titular no disponible en este pool.',404);toAddress=(await wallet(tx,toAccount.id)).address;}
        if(input.lotId){lot=backing.lots.find(item=>item.lotId===input.lotId);fail(lot&&lot.capGrossMg>0,'Lote no elegible en el pool.',409);}
        if(input.kind==='deploy'){
          fail(!await tx.chainGet('chain:state')&&!operations.some(op=>op.kind==='deploy'&&active(op)),'Ya hay un despliegue o intento pendiente.',409);
          const transactionNonce=await rpc.request({method:'eth_getTransactionCount',params:[link.address,'pending']});
          const data=concat([artifact.bytecode,AbiCoder.defaultAbiCoder().encode(['address','uint64','bytes32'],[link.address,deadline,backing.root])]);
          unsigned={...base,data,nonce:transactionNonce};state={predictedContract:getCreateAddress({from:link.address,nonce:BigInt(transactionNonce)}).toLowerCase()};
        }else{
          state=await configured(tx);await assertContract(rpc,state.contract);
          fail(state.indexedBlock!==null&&now()-Date.parse(state.syncedAt)<120000,'Actualiza la conciliación antes de preparar.',409,'RECONCILIATION_REQUIRED');
          if(['participant','register','issue'].includes(input.kind))fail((await call(rpc,state.contract,'hasRole',[(await call(rpc,state.contract,'ISSUER_ROLE'))[0],link.address]))[0],'La dirección no tiene permiso de emisor en el contrato.',403);
          let data;
          if(input.kind==='participant')data=abi.encodeFunctionData('setParticipant',[opId,deadline,toAddress,true]);
          if(input.kind==='register'){fail(!state.lots[lot.tokenId]&&!operations.some(op=>op.lotId===lot.lotId&&op.kind==='register'&&active(op)),'Lote registrado o pendiente.',409);data=abi.encodeFunctionData('registerLot',[opId,deadline,lot.sourceKey,'0x'+Buffer.from(lot.metal).toString('hex')+'00',lot.purityBps,lot.capGrossMg,lot.documentsHash,lot.proof]);}
          if(['issue','transfer','cancel'].includes(input.kind)){
            units(input.units);fail(state.lots[lot.tokenId],'El lote aún no está registrado en cadena.',409);await participant(state,link.address);
            const pending=operations.filter(op=>active(op)&&op.tokenId===lot.tokenId);
            if(input.kind==='issue'){
              await participant(state,toAddress);const reserved=pending.filter(op=>op.kind==='issue').reduce((sum,op)=>sum+BigInt(op.units),0n);
              const supply=BigInt(state.supply[lot.tokenId]??0);fail(supply+reserved+BigInt(input.units)<=BigInt(lot.capGrossMg),'La emisión excedería el respaldo DEMO reservado.',409,'BACKING_EXCEEDED');
              data=abi.encodeFunctionData('issue',[opId,deadline,lot.tokenId,toAddress,input.units]);
            }else{
              const reserved=pending.filter(op=>op.from===link.address&&['transfer','cancel'].includes(op.kind)).reduce((sum,op)=>sum+BigInt(op.units),0n);
              const owned=BigInt(state.balances[link.address]?.[lot.tokenId]??0);fail(owned-reserved>=BigInt(input.units),'Unidades DEMO disponibles insuficientes.',409,'UNITS_RESERVED');
              if(input.kind==='transfer'){fail(toAddress!==link.address,'Selecciona otro titular.');await participant(state,toAddress);data=abi.encodeFunctionData('transferDemo',[opId,deadline,lot.tokenId,toAddress,input.units]);}
              else data=abi.encodeFunctionData('cancelDemo',[opId,deadline,lot.tokenId,input.units]);
            }
          }
          unsigned={...base,to:state.contract,data};
        }
        const op={id,operationKey:opId,accountId,mineId:mine.id,kind:input.kind,from:link.address,toAccountId:toAccount?.id??null,toAddress:toAddress??null,lotId:lot?.lotId??null,tokenId:lot?.tokenId??null,units:input.units??null,
          createdAt:new Date(now()).toISOString(),deadline,status:'AWAITING_SIGNATURE',hash:null,unsigned,demoOnly:true,...(state.predictedContract?{predictedContract:state.predictedContract}:{})};
        await tx.chainPut('op:'+id,op);await tx.chainPut(key,{id,signature});return {demoOnly:true,operation:op};
      });
    },
    async submitTestnetOperation(accountId,sessionHash,id,input){
      required();fail(uuid(id)&&txHash(input.hash));await network(rpc);
      return adapter.tx(async tx=>{
        await context(tx,accountId,sessionHash);const op=await tx.chainGet('op:'+id);fail(op?.accountId===accountId,'Intento no disponible.',404);
        if(op.hash){fail(op.hash.toLowerCase()===input.hash.toLowerCase(),'El intento ya tiene otra transacción.',409);return {demoOnly:true,operation:op,replayed:true};}
        fail(op.status==='AWAITING_SIGNATURE','El intento ya no admite una transacción.',409);
        const transaction=await rpc.request({method:'eth_getTransactionByHash',params:[input.hash]});fail(transaction,'La transacción aún no está disponible. Conserva su hash y reintenta.',409,'TX_NOT_FOUND');
        validateSubmitted(op,transaction);
        fail(!(await tx.chainScan('op:')).some(other=>other.id!==id&&other.hash?.toLowerCase()===input.hash.toLowerCase()),'Transacción ya utilizada.',409);
        op.hash=input.hash.toLowerCase();op.status='SUBMITTED';await tx.chainPut('op:'+id,op);return {demoOnly:true,operation:op};
      });
    },
  };
}
export function validateSubmitted(op,transaction){
  fail(transaction&&typeof transaction.from==='string'&&typeof (transaction.input??transaction.data)==='string','La transacción no está disponible para verificar.',409,'TX_NOT_FOUND');
  fail(address(transaction.from)===op.from&&(transaction.to?address(transaction.to):null)===(op.unsigned.to??null)&&BigInt(transaction.value??0)===0n&&BigInt(transaction.chainId??0)===84532n&&(transaction.input??transaction.data).toLowerCase()===op.unsigned.data.toLowerCase()&&(!op.unsigned.nonce||BigInt(transaction.nonce)===BigInt(op.unsigned.nonce)),
    'La transacción no corresponde al intento DEMO autorizado.',409,'TX_MISMATCH');
}
