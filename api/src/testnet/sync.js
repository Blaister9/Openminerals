import {abi,address,assertContract,call,copy,fail,hex,network,ZERO} from './common.js';
import {validateSubmitted} from './service.js';
const pending=op=>['AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','REORGED','NEEDS_RECONCILIATION'].includes(op.status);
export function reconciliationService({adapter,context,rpc,now,confirmations,localSimulation,required}){
  return async function testnetReconcile(accountId,sessionHash){
    required();await network(rpc);
    return adapter.tx(async tx=>{
      const {mine}=await context(tx,accountId,sessionHash),backing=await tx.chainGet('backing:'+mine.id);fail(backing,'Reserva antes un pool DEMO.',409);
      const operations=await tx.chainScan('op:'),head=Number(BigInt(await rpc.request({method:'eth_blockNumber'}))),safeHeight=head-confirmations+1;
      let state=await tx.chainGet('chain:state');
      const deploy=operations.find(op=>op.kind==='deploy'&&op.mineId===mine.id&&!['FAILED','EXPIRED'].includes(op.status));
      if(!state){
        fail(deploy,'Prepara y firma primero el despliegue DEMO.',409);
        if(!deploy.hash){
          const safeBlock=safeHeight>=0?await rpc.request({method:'eth_getBlockByNumber',params:[hex(safeHeight),false]}):null;
          const code=safeBlock?await rpc.request({method:'eth_getCode',params:[deploy.predictedContract,hex(safeHeight)]}):null;
          if(safeBlock&&Number(BigInt(safeBlock.timestamp))>deploy.deadline&&code==='0x'){deploy.status='EXPIRED';await tx.chainPut('op:'+deploy.id,deploy);return {demoOnly:true,status:'DEPLOYMENT_EXPIRED'};}
          return {demoOnly:true,status:code&&code!=='0x'?'NEEDS_DEPLOYMENT_HASH':'AWAITING_DEPLOYMENT_HASH',predictedContract:deploy.predictedContract,confirmations};
        }
        const receipt=await rpc.request({method:'eth_getTransactionReceipt',params:[deploy.hash]});
        if(!receipt)return {demoOnly:true,status:'DEPLOYMENT_PENDING',confirmations};
        const blockNumber=Number(BigInt(receipt.blockNumber)),canonical=await rpc.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
        fail(canonical?.hash===receipt.blockHash,'El bloque del despliegue cambió; vuelve a conciliar.',409,'CHAIN_REORG');
        if(blockNumber>safeHeight){deploy.status='CONFIRMING';await tx.chainPut('op:'+deploy.id,deploy);return {demoOnly:true,status:'CONFIRMING',confirmations:head-blockNumber+1};}
        if(BigInt(receipt.status)!==1n){deploy.status='FAILED';await tx.chainPut('op:'+deploy.id,deploy);return {demoOnly:true,status:'DEPLOYMENT_FAILED'};}
        fail(receipt.contractAddress&&address(receipt.contractAddress)===deploy.predictedContract,'Dirección de despliegue distinta a la prevista.',409);
        await assertContract(rpc,receipt.contractAddress);
        state={contract:address(receipt.contractAddress),mineId:mine.id,deploymentHash:deploy.hash,deploymentBlock:blockNumber,deploymentBlockHash:receipt.blockHash,indexedBlock:null,indexedHash:null,status:'READY',lots:{},participants:{},balances:{},supply:{},events:[],demoOperations:{},orphaned:[],problems:[],demoOnly:true};
        deploy.status='CONFIRMED';deploy.blockNumber=blockNumber;deploy.blockHash=receipt.blockHash;await tx.chainPut('op:'+deploy.id,deploy);
      }
      fail(state.mineId===mine.id,'Este contrato pertenece a otro pool de testnet.',403);
      await assertContract(rpc,state.contract);
      fail((await call(rpc,state.contract,'backingRoot'))[0]===backing.root,'La raíz de respaldo del contrato no coincide con el pool reservado.',409,'BACKING_MISMATCH');
      const deploymentBlock=await rpc.request({method:'eth_getBlockByNumber',params:[hex(state.deploymentBlock),false]});
      if(deploymentBlock?.hash!==state.deploymentBlockHash){state.status='DEPLOYMENT_REORGED';state.problems=['El despliegue fue reorganizado; requiere revisión explícita.'];await tx.chainPut('chain:state',state);return {demoOnly:true,status:state.status,problems:state.problems};}
      if(safeHeight<state.deploymentBlock){state.status='CONFIRMING';await tx.chainPut('chain:state',state);return {demoOnly:true,status:'CONFIRMING'};}
      const oldHead=state.indexedBlock===null?null:await rpc.request({method:'eth_getBlockByNumber',params:[hex(state.indexedBlock),false]});
      if(state.indexedBlock!==null&&(oldHead?.hash!==state.indexedHash||state.indexedBlock>safeHeight)){
        state.orphaned.push({at:new Date(now()).toISOString(),head:state.indexedHash,events:copy(state.events)});
        Object.assign(state,{indexedBlock:null,indexedHash:null,lots:{},participants:{},balances:{},supply:{},events:[],demoOperations:{}});
      }
      const add=(owner,id,delta)=>{if(owner===ZERO)return;state.balances[owner]??={};const value=BigInt(state.balances[owner][id]??0)+delta;fail(value>=0n,'Los eventos producen un saldo negativo.',409,'CHAIN_MISMATCH');state.balances[owner][id]=value.toString();};
      for(let start=(state.indexedBlock??state.deploymentBlock-1)+1;start<=safeHeight;start+=500){
        const logs=await rpc.request({method:'eth_getLogs',params:[{address:state.contract,fromBlock:hex(start),toBlock:hex(Math.min(start+499,safeHeight))}]});
        for(const log of logs.toSorted((a,b)=>Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||Number(BigInt(a.logIndex)-BigInt(b.logIndex)))){
          fail(!log.removed,'Evento retirado durante la lectura; vuelve a conciliar.',409,'CHAIN_REORG');
          let parsed;try{parsed=abi.parseLog(log);}catch{}if(!parsed)continue;
          const a=parsed.args,metadata={transactionHash:log.transactionHash.toLowerCase(),blockNumber:Number(BigInt(log.blockNumber)),blockHash:log.blockHash,logIndex:Number(BigInt(log.logIndex))};
          if(parsed.name==='ParticipantSet')state.participants[address(a.participant)]=a.enabled;
          if(parsed.name==='LotRegistered')state.lots[a.id.toString()]={sourceKey:a.sourceKey,metal:a.metal,purityBps:Number(a.purityBps),capGrossMg:a.capGrossMg.toString(),documentsHash:a.documentsHash};
          if(parsed.name==='DemoOperation')state.demoOperations[a.operationId]={...metadata,kind:Number(a.kind),tokenId:a.id.toString(),from:address(a.from),to:address(a.to),units:a.units.toString()};
          if(['TransferSingle','TransferBatch'].includes(parsed.name)){
            const ids=parsed.name==='TransferSingle'?[a.id]:[...a.ids],values=parsed.name==='TransferSingle'?[a.value]:[...a[4]];
            const from=address(a.from),to=address(a.to);
            for(let index=0;index<ids.length;index++){
              const id=ids[index].toString(),amount=BigInt(values[index]);add(from,id,-amount);add(to,id,amount);
              const supply=BigInt(state.supply[id]??0)+(from===ZERO?amount:to===ZERO?-amount:0n);fail(supply>=0n,'Suministro negativo.',409,'CHAIN_MISMATCH');state.supply[id]=supply.toString();
              state.events.push({...metadata,tokenId:id,from,to,units:amount.toString(),demoOnly:true});
            }
          }
        }
      }
      const finalBlock=await rpc.request({method:'eth_getBlockByNumber',params:[hex(safeHeight),false]});fail(finalBlock,'Bloque confirmado no disponible.',503);
      state.problems=[];
      const sources=new Map(backing.lots.map(lot=>[lot.tokenId,lot]));
      for(const [id,lot] of Object.entries(state.lots)){
        const source=sources.get(id);
        if(!source||source.sourceKey!==lot.sourceKey||source.purityBps!==lot.purityBps||String(source.capGrossMg)!==lot.capGrossMg||source.documentsHash!==lot.documentsHash||('0x'+Buffer.from(source.metal).toString('hex')+'00')!==lot.metal){state.problems.push('Metadatos/capacidad no coinciden con el lote DEMO reservado: '+id);continue;}
        const supply=BigInt(state.supply[id]??0),reported=(await call(rpc,state.contract,'totalSupply(uint256)',[id],hex(safeHeight)))[0];
        if(supply>BigInt(source.capGrossMg)||supply!==reported)state.problems.push('Suministro incoherente: '+id);
      }
      for(const [owner,balances] of Object.entries(state.balances)){
        const identity=await tx.chainGet('address:'+owner),account=identity&&await tx.account(identity.accountId);
        if(Object.values(balances).some(value=>BigInt(value)>0n)&&account?.mineId!==mine.id)state.problems.push('Titular no vinculado al pool: '+owner);
        for(const [id,value] of Object.entries(balances))if((await call(rpc,state.contract,'balanceOf',[owner,id],hex(safeHeight)))[0]!==BigInt(value))state.problems.push('Saldo incoherente: '+owner);
      }
      // Verify that the safe head remained canonical after reading all chunks.
      const checked=await rpc.request({method:'eth_getBlockByNumber',params:[hex(safeHeight),false]});fail(checked?.hash===finalBlock.hash,'La cadena cambió durante la conciliación.',409,'CHAIN_REORG');
      for(const op of operations.filter(item=>item.kind!=='deploy')){
        const event=state.demoOperations[op.operationKey];
        if(event){
          const transaction=await rpc.request({method:'eth_getTransactionByHash',params:[event.transactionHash]});validateSubmitted(op,transaction);
          op.status='CONFIRMED';op.hash=event.transactionHash;op.blockNumber=event.blockNumber;op.blockHash=event.blockHash;
        }else if(op.status==='CONFIRMED'){op.status='REORGED';}
        else if(pending(op)){
          const receipt=op.hash?await rpc.request({method:'eth_getTransactionReceipt',params:[op.hash]}):null;
          if(receipt){
            const block=await rpc.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
            if(block?.hash===receipt.blockHash&&Number(BigInt(receipt.blockNumber))<=safeHeight){
              if(BigInt(receipt.status)===0n)op.status='FAILED';else{op.status='NEEDS_RECONCILIATION';state.problems.push('Transacción confirmada sin su evento DEMO esperado: '+op.id);}
            }else op.status='CONFIRMING';
          }
          if(pending(op)&&Number(BigInt(finalBlock.timestamp))>op.deadline&&!(await call(rpc,state.contract,'processedOperations',[op.operationKey],hex(safeHeight)))[0])op.status='EXPIRED';
        }
        await tx.chainPut('op:'+op.id,op);
      }
      state.status=state.problems.length?'MISMATCH':'READY';state.indexedBlock=safeHeight;state.indexedHash=finalBlock.hash;state.syncedAt=new Date(now()).toISOString();await tx.chainPut('chain:state',state);
      return {demoOnly:true,execution:localSimulation?'local-simulated':'base-sepolia',status:state.status,indexedBlock:safeHeight,indexedHash:finalBlock.hash,confirmations,problems:state.problems};
    });
  };
}
