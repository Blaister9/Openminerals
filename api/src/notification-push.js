import {randomUUID} from 'node:crypto';

export function expoPushTransport({accessToken,fetchImpl=fetch}={}){
  async function post(path,body){
    const response=await fetchImpl('https://exp.host/--/api/v2/push/'+path,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(body)});
    if(!response.ok)throw Object.assign(new Error('Expo push request failed'),{permanent:response.status>=400&&response.status<500&&response.status!==429});
    const value=await response.json();if(!value?.data||value.errors)throw new Error('Invalid Expo push response');return value.data;
  }
  return {send:messages=>post('send',messages),receipts:ids=>post('getReceipts',{ids})};
}

// Claims and acknowledgements are durable. Network work runs OUTSIDE the DB
// transaction. A timeout/crash can cause a duplicate push; inbox IDs deduplicate.
export function pushDispatcher(adapter,{required,context,now,pushSendEnabled,pushTransport}){
  async function allowed(tx,job){
    const {document}=await context(tx,job.accountId),device=await tx.notificationGet('device:'+job.deviceId);
    const auth=device&&await tx.auth(device.sessionHash);
    return document.preferences.enabled&&document.preferences.push&&document.preferences[job.category]&&device?.active&&device.token&&device.revision===job.deviceRevision&&device.sessionHash===job.sessionHash&&auth?.accountId===job.accountId&&Date.parse(auth.expiresAt)>now()?device:null;
  }
  return async function dispatchNotifications(){
    required();if(!pushSendEnabled||!pushTransport)return {demoOnly:true,status:'disabled',processed:0};
    const claimed=await adapter.tx(async tx=>{
      await tx.lockNotifications();const work=[];
      for(const job of await tx.notificationScan('push:')){
        if(work.length>=20)break;
        if(!['READY','SENDING','WAIT_RECEIPT','CHECKING_RECEIPT'].includes(job.status)||job.nextAt>now())continue;
        if(job.expiresAt<=now()){job.status='EXPIRED';await tx.notificationPut(job.id,job);continue;}
        const device=await allowed(tx,job);
        if(!device){job.status='CANCELLED';await tx.notificationPut(job.id,job);continue;}
        const receipt=!!job.ticketId;
        if(!receipt&&job.attempts>=5){job.status='FAILED';await tx.notificationPut(job.id,job);continue;}
        if(!receipt)job.attempts++;
        job.status=receipt?'CHECKING_RECEIPT':'SENDING';job.lease=randomUUID();job.nextAt=now()+120000;await tx.notificationPut(job.id,job);
        work.push({...job,token:device.token,receipt});
      }
      return work;
    });
    const sending=claimed.filter(item=>!item.receipt),receipts=claimed.filter(item=>item.receipt);
    async function finish(job,result,error){
      await adapter.tx(async tx=>{
        await tx.lockNotifications();const current=await tx.notificationGet(job.id);if(current?.lease!==job.lease)return;
        const device=await allowed(tx,current);
        if(!device){current.status='CANCELLED';}
        else if(result?.status==='ok'){
          if(job.receipt)current.status='PROVIDER_ACCEPTED';
          else if(typeof result.id==='string'&&result.id.length>0){current.ticketId=result.id;current.status='WAIT_RECEIPT';current.nextAt=now()+15*60000;}
          else error=new Error('Missing push ticket');
        }else if(result?.details?.error==='DeviceNotRegistered'){
          current.status='DEVICE_UNREGISTERED';device.active=false;device.token=null;device.revision++;device.updatedAt=new Date(now()).toISOString();await tx.notificationPut('device:'+device.id,device);
        }else if(result?.status==='error'&&result?.details?.error!=='MessageRateExceeded')current.status='FAILED';
        else error??=new Error('Push receipt unavailable');
        if(error&&device){current.status=error.permanent?'FAILED':current.ticketId?'WAIT_RECEIPT':'READY';current.nextAt=now()+Math.min(3600000,30000*2**Math.min(current.attempts,6));}
        current.lease=null;await tx.notificationPut(current.id,current);
      });
    }
    if(sending.length){
      try{
        const results=await pushTransport.send(sending.map(job=>({to:job.token,title:'Openminerals · DEMO',body:'Tienes actividad nueva de demostración. Abre el centro de notificaciones.',
          data:{demoOnly:true,accountId:job.accountId,notificationId:job.noticeId},channelId:'openminerals-demo',sound:'default'})));
        if(!Array.isArray(results)||results.length!==sending.length)throw new Error('Invalid push tickets');
        for(let i=0;i<sending.length;i++)await finish(sending[i],results[i]);
      }catch(error){for(const job of sending)await finish(job,null,error);}
    }
    if(receipts.length){
      try{const results=await pushTransport.receipts(receipts.map(job=>job.ticketId));for(const job of receipts)await finish(job,results[job.ticketId]);}
      catch(error){for(const job of receipts)await finish(job,null,error);}
    }
    return {demoOnly:true,status:'processed',processed:claimed.length};
  };
}
