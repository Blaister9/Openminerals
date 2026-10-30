import {randomUUID} from 'node:crypto';
import {seedState,applyCommand,METALS} from './domain.js';
import {DEFAULT_MINE_ID,seedMine,accountStateForMine,importLegacyState,applyAccountCommand,applyStockCommand,summarizeMine,operatorReceiptView} from './shared-mine.js';
import {AUTH_LIFETIME_MS,accountError,normalizeAlias,passwordRecord,passwordMatches,newAuthToken,tokenHash,publicAccount} from './account-auth.js';
import {readReceipt} from './receipt-history.js';
import {ensureCustody,validateCustody,allocateCustody,releaseCustody,addStockLot,custodyView,custodyCertificate} from './custody.js';
import {marketplaceCatalog,marketReplay,settleMarketplace} from './marketplace.js';
import {ensureDelivery,deliveryView,applyBuyerDelivery,operatorDeliveryReplay,applyOperatorDelivery} from './delivery.js';
import {parseManagementQuery,managementView} from './management.js';
import {accountServices} from './account-services.js';
import {lotHistoryView,parseLotHistoryQuery} from './custody-history.js';
import {syncReservations} from './custody-reservations.js';
import {intakeView,applyIntake,validateIntake} from './intake.js';
import {publicBuyerState,publicBuyerReceipt,publicMine} from './public-custody.js';

const ID_PATTERN=/^[A-Za-z0-9_-]{16,100}$/;
const clone=value=>structuredClone(value);
const unauthorized=()=>accountError(401,'Inicia sesión de nuevo con tu cuenta demo.','UNAUTHORIZED');
const forbidden=()=>accountError(403,'Esta función requiere el rol de cuenta demo correspondiente.','FORBIDDEN');
const claimed=()=>accountError(409,'Esta sesión anterior ya está vinculada a una cuenta demo. Inicia sesión para operar; su historial anterior se conserva.','LEGACY_CLAIMED');
export function validateSessionId(id){
  if(typeof id!=='string'||!ID_PATTERN.test(id))throw Object.assign(new Error('Sesión demo inválida'),{status:400});
  return id;
}
function validateMineInput({name,initialInventoryMg}={}){
  if(typeof name!=='string'||name.trim().length<3||name.trim().length>80)throw accountError(400,'Nombre de mina demo inválido.');
  if(initialInventoryMg!==undefined){
    if(!initialInventoryMg||typeof initialInventoryMg!=='object'||Array.isArray(initialInventoryMg)||
      Object.keys(initialInventoryMg).some(key=>!Object.hasOwn(METALS,key))||
      Object.values(initialInventoryMg).some(value=>!Number.isSafeInteger(value)||value<0||value>1_000_000_000))throw accountError(400,'Inventario inicial demo inválido.');
  }
  return {name:name.trim(),initialInventoryMg};
}
function requireRole(account,role){if(!account)throw unauthorized();if(account.role!==role)throw forbidden();}
function makeStore(adapter){
  async function custodyMine(tx,mine){
    const result=ensureCustody(mine,await tx.accountsForMine(mine.id));
    const delivery=ensureDelivery(result.mine);
    const reservations=syncReservations(delivery.mine,await tx.accountsForMine(mine.id));
    validateIntake(reservations.mine);
    if(result.changed||delivery.changed||reservations.changed)await tx.saveMine(reservations.mine);
    return reservations.mine;
  }
  async function authenticatedContext(tx,accountId,role){
    const first=await tx.account(accountId);
    requireRole(first,role);
    let mine=await tx.mine(first.mineId,true);
    if(!mine)throw accountError(404,'Mina demo no disponible.');
    const account=await tx.account(accountId,true);
    requireRole(account,role);
    mine=await custodyMine(tx,mine);
    return {account,mine};
  }
  async function addAccount({alias,password,role='buyer',mineId=DEFAULT_MINE_ID,legacySessionId}={}){
    alias=normalizeAlias(alias);
    if(!['buyer','operator'].includes(role))throw accountError(400,'Rol demo inválido.');
    if(legacySessionId!==undefined&&role!=='buyer')throw accountError(400,'Solo un comprador puede vincular una sesión anterior.');
    if(legacySessionId!==undefined)validateSessionId(legacySessionId);
    const credentials=await passwordRecord(password);
    const account=await adapter.tx(async tx=>{
      let mine=await tx.mine(mineId,true);
      if(!mine)throw accountError(404,'Mina demo no disponible.');
      mine=await custodyMine(tx,mine);
      if(await tx.alias(alias))throw accountError(409,'Ese alias demo ya existe.','ALIAS_TAKEN');
      let state=seedState();
      if(legacySessionId!==undefined){
        await tx.ensureLegacy(legacySessionId);
        const legacy=await tx.legacy(legacySessionId,true);
        if(await tx.claim(legacySessionId))throw claimed();
        ({state,mine}=importLegacyState(legacy,mine));
      }
      const result={id:`account-${randomUUID()}`,alias,role,mineId,...credentials,state,legacySessionId:legacySessionId??null,createdAt:new Date().toISOString()};
      await tx.insertAccount(result);
      if(legacySessionId!==undefined){
        for(const metal of Object.keys(METALS))if(state.holdingsMg[metal])({mine}=allocateCustody(mine,result,metal,state.holdingsMg[metal],`import:${result.id}`));
        ({mine}=syncReservations(mine,await tx.accountsForMine(mine.id)));
        validateCustody(mine,await tx.accountsForMine(mine.id));
        await tx.saveMine(mine);
      }
      return result;
    });
    return publicAccount(account);
  }
  async function issueSession(accountId){
    const token=newAuthToken(),expiresAt=new Date(Date.now()+AUTH_LIFETIME_MS).toISOString();
    const context=await adapter.tx(async tx=>{
      const account=await tx.account(accountId);
      if(!account)throw unauthorized();
      const mine=await tx.mine(account.mineId);
      await tx.insertAuth({hash:tokenHash(token),accountId,expiresAt});
      return {account:publicAccount(account),mine:publicMine(mine,account)};
    });
    return {...context,token,expiresAt,demoOnly:true};
  }
  return {
    ...accountServices(adapter),
    mode:adapter.mode,
    ping:()=>adapter.ping(),
    async get(id){
      validateSessionId(id);
      return adapter.tx(async tx=>{
        await tx.ensureLegacy(id);
        const state=clone(await tx.legacy(id,true));
        if(await tx.claim(id))state.legacyReadOnly=true;
        return state;
      });
    },
    async mutate(id,command){
      validateSessionId(id);
      return adapter.tx(async tx=>{
        await tx.ensureLegacy(id);
        const current=await tx.legacy(id,true);
        if(await tx.claim(id))throw claimed();
        const result=applyCommand(current,command);
        if(result.changed)await tx.saveLegacy(id,result.state);
        return clone(result);
      });
    },
    async reset(id){
      validateSessionId(id);
      return adapter.tx(async tx=>{
        await tx.ensureLegacy(id);await tx.legacy(id,true);
        if(await tx.claim(id))throw claimed();
        const state=seedState();await tx.saveLegacy(id,state);return clone(state);
      });
    },
    async registerAccount({alias,password,legacySessionId}={}){
      const account=await addAccount({alias,password,legacySessionId,role:'buyer',mineId:DEFAULT_MINE_ID});
      return issueSession(account.id);
    },
    createAccount:options=>addAccount(options),
    async createMine(input){
      const {name,initialInventoryMg}=validateMineInput(input);
      let mine=seedMine(`mine-${randomUUID()}`,name);
      // A new mine has no received stock unless the administrator explicitly
      // supplies a DEMO opening balance. Existing/default/legacy mines retain
      // their original quantities; omitted metals never create hidden stock.
      for(const metal of Object.keys(METALS)){
        const value=initialInventoryMg?.[metal]??0;
        mine.inventoryMg[metal]=value;mine.totalSupplyMg[metal]=value;
      }
      ({mine}=ensureCustody(mine,[]));
      ({mine}=ensureDelivery(mine));
      await adapter.tx(tx=>tx.insertMine(mine));
      return {id:mine.id,name:mine.name,demoOnly:true};
    },
    async loginAccount(rawAlias,password){
      let alias;
      try {alias=normalizeAlias(rawAlias);}catch{throw unauthorized();}
      return adapter.tx(async tx=>{
        const first=await tx.alias(alias),account=first?await tx.account(first.id,true):undefined;
        if(!await passwordMatches(password,account))throw unauthorized();
        const mine=await tx.mine(account.mineId),token=newAuthToken(),expiresAt=new Date(Date.now()+AUTH_LIFETIME_MS).toISOString();
        await tx.insertAuth({hash:tokenHash(token),accountId:account.id,expiresAt});
        return {account:publicAccount(account),mine:publicMine(mine,account),token,expiresAt,demoOnly:true};
      });
    },
    async authenticate(token){
      if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw unauthorized();
      return adapter.tx(async tx=>{
        const auth=await tx.auth(tokenHash(token));
        if(!auth||new Date(auth.expiresAt).getTime()<=Date.now())throw unauthorized();
        const account=await tx.account(auth.accountId);
        if(!account)throw unauthorized();
        const mine=await tx.mine(account.mineId);
        if(!mine)throw unauthorized();
        return {account:publicAccount(account),mine:publicMine(mine,account),demoOnly:true};
      });
    },
    async logoutAccount(token){
      if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw unauthorized();
      await adapter.tx(tx=>tx.deleteAuth(tokenHash(token)));
      return {ok:true,demoOnly:true};
    },
    async getAccountState(accountId){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'buyer');
        return {...publicBuyerState(accountStateForMine(account.state,mine)),account:publicAccount(account)};
      });
    },
    async mutateAccount(accountId,command){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'buyer');
        if(['delivery_accept','delivery_reject'].includes(command.action)){
          const result=applyBuyerDelivery(mine,{...account,state:accountStateForMine(account.state,mine)},command);
          if(result.changed){
            const accounts=(await tx.accountsForMine(account.mineId)).map(item=>item.id===account.id?{...item,state:result.state}:item);
            result.mine=syncReservations(result.mine,accounts,{at:result.receipt.at,referenceId:command.requestId}).mine;
            validateCustody(result.mine,accounts);await tx.saveMine(result.mine);
            await tx.saveAccountState(account.id,result.state);
          }
          return {receipt:publicBuyerReceipt(result.receipt),state:{...publicBuyerState(accountStateForMine(result.state,result.mine)),account:publicAccount(account)},changed:result.changed};
        }
        if(command.action==='market_buy'){
          const replay=marketReplay(account.state,command);
          if(replay)return {receipt:replay,state:{...publicBuyerState(accountStateForMine(account.state,mine)),account:publicAccount(account)},changed:false};
          if(typeof command.sellerId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(command.sellerId)||typeof command.offerId!=='string'||!/^offer-\d{1,20}$/.test(command.offerId))throw accountError(400,'Identificador de oferta DEMO inválido.');
          const target=await tx.account(command.sellerId);
          if(!target||target.mineId!==account.mineId)throw accountError(404,'Oferta no disponible en esta mina.');
          // Lock only a seller from this mine, after its already locked mine row.
          const seller=await tx.account(target.id,true);
          const trade=settleMarketplace(mine,{...account,state:accountStateForMine(account.state,mine)},{...seller,state:accountStateForMine(seller.state,mine)},command);
          const accounts=(await tx.accountsForMine(account.mineId)).map(item=>item.id===account.id?{...item,state:trade.buyerState}:item.id===seller.id?{...item,state:trade.sellerState}:item);
          trade.mine=syncReservations(trade.mine,accounts,{at:trade.buyerReceipt.at,referenceId:command.requestId}).mine;
          validateCustody(trade.mine,accounts);
          await tx.saveMine(trade.mine);await tx.saveAccountState(account.id,trade.buyerState);await tx.saveAccountState(seller.id,trade.sellerState);
          return {receipt:clone(trade.buyerReceipt),state:{...publicBuyerState(accountStateForMine(trade.buyerState,trade.mine)),account:publicAccount(account)},changed:true};
        }
        const result=applyAccountCommand(account.state,mine,command,{accountId:account.id});
        if(result.changed){
          if(command.action==='buy'){
            const allocation=allocateCustody(result.mine,account,command.metal,result.receipt.mg,`buy:${command.requestId}`,result.receipt.at,{referenceId:command.requestId});
            result.mine=allocation.mine;
            result.receipt.certificateIds=allocation.allocations.map(item=>item.certificateId);
            result.state.receipts[command.requestId]=clone(result.receipt);
          }
          if(command.action==='sell')result.mine=releaseCustody(result.mine,account.id,command.metal,result.receipt.mg,{referenceId:command.requestId,at:result.receipt.at});
          const accounts=(await tx.accountsForMine(account.mineId)).map(item=>item.id===account.id?{...item,state:result.state}:item);
          result.mine=syncReservations(result.mine,accounts,{at:result.receipt.at,referenceId:command.requestId}).mine;
          validateCustody(result.mine,accounts);
          await tx.saveMine(result.mine);await tx.saveAccountState(account.id,result.state);
        }
        return {receipt:publicBuyerReceipt(result.receipt),state:{...publicBuyerState(accountStateForMine(result.state,result.mine)),account:publicAccount(account)},changed:result.changed};
      });
    },
    async getMineSummary(accountId){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        return summarizeMine(mine,await tx.accountsForMine(account.mineId));
      });
    },
    async getIntake(accountId){
      return adapter.tx(async tx=>{
        const {mine}=await authenticatedContext(tx,accountId,'operator'),summary=summarizeMine(mine,await tx.accountsForMine(mine.id));
        return {...intakeView(mine),availability:{inventoryMg:summary.inventoryMg,allocatedMg:summary.allocatedMg,reservedMg:summary.reservedMg,deliveryCommittedMg:summary.deliveryCommittedMg,totalSupplyMg:summary.totalSupplyMg,reconciled:true}};
      });
    },
    async mutateIntake(accountId,command){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        const result=applyIntake(mine,account,command);
        validateCustody(result.mine,await tx.accountsForMine(account.mineId));
        if(result.changed)await tx.saveMine(result.mine);
        return {receipt:clone(result.receipt),mine:summarizeMine(result.mine,await tx.accountsForMine(account.mineId)),changed:result.changed,demoOnly:true};
      });
    },
    async mutateStock(accountId,command){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        const result=applyStockCommand(mine,command,{accountId:account.id,alias:account.alias});
        if(result.changed){
          const addition=addStockLot(result.mine,command,result.receipt.at);result.mine=addition.mine;
          result.receipt.lotId=addition.lot.id;result.mine.stockReceipts[command.requestId]=clone(result.receipt);
          validateCustody(result.mine,await tx.accountsForMine(account.mineId));
          await tx.saveMine(result.mine);
        }
        return {receipt:clone(result.receipt),mine:summarizeMine(result.mine,await tx.accountsForMine(account.mineId)),changed:result.changed,demoOnly:true};
      });
    },
    async getCustody(accountId,role='buyer'){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,role);
        return custodyView(mine,await tx.accountsForMine(account.mineId),account);
      });
    },
    async getMarketplace(accountId){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'buyer');
        return marketplaceCatalog(mine,await tx.accountsForMine(account.mineId),account);
      });
    },
    async getLotHistory(accountId,lotId,params=new URLSearchParams()){
      const query=parseLotHistoryQuery(params);
      if(typeof lotId!=='string'||!/^lot-[a-f0-9]{32}$/.test(lotId))throw accountError(400,'Identificador de lote DEMO inválido.');
      return adapter.tx(async tx=>{
        const first=await tx.account(accountId);if(!first)throw unauthorized();
        const {account,mine}=await authenticatedContext(tx,accountId,first.role);
        return lotHistoryView(mine,await tx.accountsForMine(account.mineId),account,lotId,query);
      });
    },
    async getDeliveries(accountId,role='buyer'){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,role);
        return deliveryView(mine,await tx.accountsForMine(account.mineId),account);
      });
    },
    async getManagement(accountId,params=new URLSearchParams()){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        return managementView(mine,await tx.accountsForMine(account.mineId),account,parseManagementQuery(params));
      });
    },
    async mutateDelivery(accountId,command){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        const replay=operatorDeliveryReplay(mine,account,command);
        if(replay)return {receipt:replay,mine:summarizeMine(mine,await tx.accountsForMine(account.mineId)),changed:false,demoOnly:true};
        let buyer;
        if(command.action!=='delivery_config'){
          if(typeof command.buyerId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(command.buyerId))throw accountError(400,'Comprador DEMO inválido.');
          const first=await tx.account(command.buyerId);
          if(!first||first.role!=='buyer'||first.mineId!==account.mineId)throw accountError(404,'Comprador DEMO no disponible en esta mina.');
          buyer=await tx.account(first.id,true);buyer={...buyer,state:accountStateForMine(buyer.state,mine)};
        }
        const result=applyOperatorDelivery(mine,account,buyer,command);
        const accounts=(await tx.accountsForMine(account.mineId)).map(item=>buyer&&item.id===buyer.id?{...item,state:result.state}:item);
        result.mine=syncReservations(result.mine,accounts,{at:result.receipt.at,referenceId:command.requestId}).mine;
        validateCustody(result.mine,accounts);await tx.saveMine(result.mine);
        if(buyer)await tx.saveAccountState(buyer.id,result.state);
        return {receipt:clone(result.receipt),mine:summarizeMine(result.mine,accounts),changed:true,demoOnly:true};
      });
    },
    async getMineCommand(accountId,receiptId,{actorId,kind}={}){
      return adapter.tx(async tx=>{
        const {account,mine}=await authenticatedContext(tx,accountId,'operator');
        if(typeof receiptId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(receiptId))throw accountError(400,'Identificador de comprobante DEMO inválido.');
        if(kind!==undefined&&!['command','stock','intake'].includes(kind))throw accountError(400,'Tipo de comprobante DEMO inválido.');
        if(actorId!==undefined){
          if(typeof actorId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(actorId))throw accountError(400,'Operador de comprobante DEMO inválido.');
          const actor=await tx.account(actorId);if(!actor||actor.role!=='operator'||actor.mineId!==account.mineId)throw accountError(404,'Comprobante de comando DEMO no disponible.');
        }
        const candidates=[...(!kind||kind==='command'?Object.values(mine.commandReceipts):[]),...(!kind||kind==='stock'?Object.values(mine.stockReceipts):[]),...(!kind||kind==='intake'?Object.values(mine.intake?.receipts??{}):[])].filter(receipt=>receipt.id===receiptId&&(!actorId||receipt.actor?.id===actorId));
        const own=candidates.filter(receipt=>receipt.actor?.id===account.id);
        const receipt=candidates.length===1?candidates[0]:!actorId&&own.length===1?own[0]:undefined;
        if(!receipt){if(candidates.length>1)throw accountError(409,'Especifica operador y tipo para este comprobante DEMO.');throw accountError(404,'Comprobante de comando DEMO no disponible.');}
        const result=clone(receipt);delete result.balancesAfter;return result;
      });
    },
    async getCertificate(accountId,certificateId){
      return adapter.tx(async tx=>{
        const first=await tx.account(accountId);if(!first)throw unauthorized();
        const {account,mine}=await authenticatedContext(tx,accountId,first.role);
        return custodyCertificate(mine,await tx.accountsForMine(account.mineId),account,certificateId);
      });
    },
    async getMineReceipt(operatorId,targetId,receiptId){
      return adapter.tx(async tx=>{
        const {account}=await authenticatedContext(tx,operatorId,'operator');
        const target=await tx.account(targetId);
        if(!target||target.role!=='buyer'||target.mineId!==account.mineId)throw accountError(404,'Comprobante no disponible en esta mina.');
        const receipt=readReceipt(target.state,receiptId);
        if(receipt.mineId!==account.mineId||receipt.accountId!==targetId||!['buy','sell','offer','cancel_offer','delivery','cancel_delivery','market_buy','market_sell','delivery_quote','delivery_accept','delivery_reject','delivery_transition'].includes(receipt.action))throw accountError(404,'Comprobante no disponible en esta mina.');
        return operatorReceiptView(receipt);
      });
    },
    close:()=>adapter.close(),
  };
}

function memoryAdapter(){
  let database={legacy:new Map(),accounts:new Map(),mines:new Map([[DEFAULT_MINE_ID,seedMine(DEFAULT_MINE_ID,'Openminerals · Mina demo')]]),auth:new Map(),profiles:new Map(),recoveryKeys:new Map(),recoveryChallenges:new Map(),recoveryAttempts:new Map()};
  let queue=Promise.resolve();
  return {
    mode:'memory-demo',async ping(){return true;},async close(){},
    async tx(work){
      let release;const previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;
      const db=clone(database);
      const tx={
        async mine(id){return clone(db.mines.get(id));},async insertMine(mine){if(db.mines.has(mine.id))throw accountError(409,'La mina demo ya existe.');db.mines.set(mine.id,clone(mine));},async saveMine(mine){db.mines.set(mine.id,clone(mine));},
        async ensureLegacy(id){if(!db.legacy.has(id))db.legacy.set(id,seedState());},async legacy(id){return clone(db.legacy.get(id));},async saveLegacy(id,state){db.legacy.set(id,clone(state));},
        async account(id){return clone(db.accounts.get(id));},async alias(alias){return clone([...db.accounts.values()].find(account=>account.alias===alias));},
        async claim(id){return [...db.accounts.values()].some(account=>account.legacySessionId===id);},
        async insertAccount(account){if([...db.accounts.values()].some(a=>a.alias===account.alias||account.legacySessionId&&a.legacySessionId===account.legacySessionId))throw accountError(409,'El alias o la sesión ya están vinculados.');db.accounts.set(account.id,clone(account));},
        async saveAccountState(id,state){db.accounts.get(id).state=clone(state);},async accountsForMine(id){return clone([...db.accounts.values()].filter(a=>a.mineId===id));},
        async auth(hash){return clone(db.auth.get(hash));},async insertAuth(auth){db.auth.set(auth.hash,clone(auth));},async deleteAuth(hash){db.auth.delete(hash);},
        async deleteAccountAuth(accountId){for(const [hash,auth] of db.auth)if(auth.accountId===accountId)db.auth.delete(hash);},
        async savePassword(id,credentials){Object.assign(db.accounts.get(id),clone(credentials));},
        async profile(id){return clone(db.profiles.get(id));},async saveProfile(id,profile){db.profiles.set(id,clone(profile));},
        async recoveryKey(id){return clone(db.recoveryKeys.get(id));},async saveRecoveryKey(id,keyHash){db.recoveryKeys.set(id,{keyHash,updatedAt:new Date().toISOString()});},
        async recoveryChallenge(hash){return clone(db.recoveryChallenges.get(hash));},async insertRecoveryChallenge(challenge){db.recoveryChallenges.set(challenge.hash,clone(challenge));},
        async deleteRecoveryChallenges(accountId){for(const [hash,challenge] of db.recoveryChallenges)if(challenge.accountId===accountId)db.recoveryChallenges.delete(hash);},
        async recoveryAttempt(keyHash,limit,windowMs){
          const now=Date.now();let row=db.recoveryAttempts.get(keyHash);
          if(!row||Date.parse(row.resetAt)<=now)row={count:1,resetAt:new Date(now+windowMs).toISOString()};else row={...row,count:Math.min(row.count,limit)+1};
          db.recoveryAttempts.set(keyHash,row);return row.count<=limit;
        },
      };
      try{const result=await work(tx);database=db;return result;}finally{release();}
    },
  };
}

async function postgresAdapter(databaseUrl){
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:databaseUrl,max:8,connectionTimeoutMillis:8000});
  let startup;
  try{
    startup=await pool.connect();
    await startup.query('BEGIN');
    await startup.query("SELECT pg_advisory_xact_lock(hashtext('openminerals-demo-store-v2-init'))");
    await startup.query(`CREATE TABLE IF NOT EXISTS demo_sessions (id TEXT PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS demo_mines (id TEXT PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS demo_accounts (id TEXT PRIMARY KEY,alias TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('buyer','operator')),mine_id TEXT NOT NULL REFERENCES demo_mines(id),password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,state JSONB NOT NULL,legacy_session_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS demo_auth_sessions (token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES demo_accounts(id),expires_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_account_profiles (account_id TEXT PRIMARY KEY REFERENCES demo_accounts(id),profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS demo_recovery_keys (account_id TEXT PRIMARY KEY REFERENCES demo_accounts(id),key_hash TEXT NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS demo_recovery_challenges (token_hash TEXT PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),account_id TEXT NOT NULL REFERENCES demo_accounts(id),expires_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_recovery_attempts (key_hash TEXT PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'),count INTEGER NOT NULL CHECK(count>=0),reset_at TIMESTAMPTZ NOT NULL);
      CREATE INDEX IF NOT EXISTS demo_accounts_mine_idx ON demo_accounts(mine_id);
      CREATE INDEX IF NOT EXISTS demo_auth_sessions_account_idx ON demo_auth_sessions(account_id);
      CREATE INDEX IF NOT EXISTS demo_recovery_challenges_account_idx ON demo_recovery_challenges(account_id);`);
    await startup.query('INSERT INTO demo_mines(id,state) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING',[DEFAULT_MINE_ID,JSON.stringify(seedMine(DEFAULT_MINE_ID,'Openminerals · Mina demo'))]);
    await startup.query('COMMIT');
  }catch(error){
    if(startup){try{await startup.query('ROLLBACK');}catch{}startup.release();startup=undefined;}
    await pool.end().catch(()=>{});
    throw error;
  }finally{startup?.release();}
  const accountRow=row=>row?{id:row.id,alias:row.alias,role:row.role,mineId:row.mine_id,passwordSalt:row.password_salt,passwordHash:row.password_hash,state:row.state,legacySessionId:row.legacy_session_id,createdAt:row.created_at.toISOString()}:undefined;
  return {
    mode:'postgres-demo',async ping(){await pool.query('SELECT 1');return true;},async close(){await pool.end();},
    async tx(work){
      const client=await pool.connect();
      const one=async(sql,args)=>(await client.query(sql,args)).rows[0];
      const tx={
        async mine(id,lock=false){return (await one(`SELECT state FROM demo_mines WHERE id=$1${lock?' FOR UPDATE':''}`,[id]))?.state;},
        async insertMine(mine){await client.query('INSERT INTO demo_mines(id,state) VALUES($1,$2::jsonb)',[mine.id,JSON.stringify(mine)]);},
        async saveMine(mine){await client.query('UPDATE demo_mines SET state=$2::jsonb,updated_at=NOW() WHERE id=$1',[mine.id,JSON.stringify(mine)]);},
        async ensureLegacy(id){await client.query('INSERT INTO demo_sessions(id,state) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING',[id,JSON.stringify(seedState())]);},
        async legacy(id,lock=false){return (await one(`SELECT state FROM demo_sessions WHERE id=$1${lock?' FOR UPDATE':''}`,[id]))?.state;},
        async saveLegacy(id,state){await client.query('UPDATE demo_sessions SET state=$2::jsonb,updated_at=NOW() WHERE id=$1',[id,JSON.stringify(state)]);},
        async account(id,lock=false){return accountRow(await one(`SELECT * FROM demo_accounts WHERE id=$1${lock?' FOR UPDATE':''}`,[id]));},
        async alias(alias){return accountRow(await one('SELECT * FROM demo_accounts WHERE alias=$1',[alias]));},
        async claim(id){return Boolean(await one('SELECT id FROM demo_accounts WHERE legacy_session_id=$1',[id]));},
        async insertAccount(account){await client.query('INSERT INTO demo_accounts(id,alias,role,mine_id,password_salt,password_hash,state,legacy_session_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[account.id,account.alias,account.role,account.mineId,account.passwordSalt,account.passwordHash,JSON.stringify(account.state),account.legacySessionId]);},
        async saveAccountState(id,state){await client.query('UPDATE demo_accounts SET state=$2::jsonb WHERE id=$1',[id,JSON.stringify(state)]);},
        async accountsForMine(id){return (await client.query('SELECT * FROM demo_accounts WHERE mine_id=$1',[id])).rows.map(accountRow);},
        async auth(hash){const row=await one('SELECT account_id,expires_at FROM demo_auth_sessions WHERE token_hash=$1',[hash]);return row?{accountId:row.account_id,expiresAt:row.expires_at.toISOString()}:undefined;},
        async insertAuth(auth){await client.query('DELETE FROM demo_auth_sessions WHERE expires_at<=NOW()');await client.query('INSERT INTO demo_auth_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[auth.hash,auth.accountId,auth.expiresAt]);},
        async deleteAuth(hash){await client.query('DELETE FROM demo_auth_sessions WHERE token_hash=$1',[hash]);},
        async deleteAccountAuth(accountId){await client.query('DELETE FROM demo_auth_sessions WHERE account_id=$1',[accountId]);},
        async savePassword(id,credentials){await client.query('UPDATE demo_accounts SET password_salt=$2,password_hash=$3 WHERE id=$1',[id,credentials.passwordSalt,credentials.passwordHash]);},
        async profile(id){return (await one('SELECT profile FROM demo_account_profiles WHERE account_id=$1',[id]))?.profile;},
        async saveProfile(id,profile){await client.query('INSERT INTO demo_account_profiles(account_id,profile) VALUES($1,$2::jsonb) ON CONFLICT(account_id) DO UPDATE SET profile=EXCLUDED.profile,updated_at=NOW()',[id,JSON.stringify(profile)]);},
        async recoveryKey(id){const row=await one('SELECT key_hash,updated_at FROM demo_recovery_keys WHERE account_id=$1',[id]);return row?{keyHash:row.key_hash,updatedAt:row.updated_at.toISOString()}:undefined;},
        async saveRecoveryKey(id,keyHash){await client.query('INSERT INTO demo_recovery_keys(account_id,key_hash) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET key_hash=EXCLUDED.key_hash,updated_at=NOW()',[id,keyHash]);},
        async recoveryChallenge(hash,lock=false){const row=await one(`SELECT account_id,expires_at FROM demo_recovery_challenges WHERE token_hash=$1${lock?' FOR UPDATE':''}`,[hash]);return row?{hash,accountId:row.account_id,expiresAt:row.expires_at.toISOString()}:undefined;},
        async insertRecoveryChallenge(challenge){await client.query('INSERT INTO demo_recovery_challenges(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[challenge.hash,challenge.accountId,challenge.expiresAt]);},
        async deleteRecoveryChallenges(accountId){await client.query('DELETE FROM demo_recovery_challenges WHERE account_id=$1',[accountId]);},
        async recoveryAttempt(keyHash,limit,windowMs){
          const row=await one(`INSERT INTO demo_recovery_attempts(key_hash,count,reset_at) VALUES($1,1,NOW()+$2::integer*INTERVAL '1 millisecond')
            ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN demo_recovery_attempts.reset_at<=NOW() THEN 1 ELSE LEAST(demo_recovery_attempts.count,$3::integer)+1 END,
            reset_at=CASE WHEN demo_recovery_attempts.reset_at<=NOW() THEN EXCLUDED.reset_at ELSE demo_recovery_attempts.reset_at END RETURNING count`,[keyHash,windowMs,limit]);
          return row.count<=limit;
        },
      };
      try{await client.query('BEGIN');const result=await work(tx);await client.query('COMMIT');return result;}
      catch(error){try{await client.query('ROLLBACK');}catch{}if(error.code==='23505')throw accountError(409,'El alias o la sesión ya están vinculados.','ACCOUNT_CONFLICT');throw error;}
      finally{client.release();}
    },
  };
}

// Additive tables leave original sessions and receipts intact. Mine -> account locks
// serialize buyers across processes; the memory adapter is only a local demo.
export async function createStore(databaseUrl=process.env.DATABASE_URL){
  if(!databaseUrl){
    if(process.env.REQUIRE_DATABASE==='true')throw new Error('REQUIRE_DATABASE activo pero no hay DATABASE_URL');
    return makeStore(memoryAdapter());
  }
  return makeStore(await postgresAdapter(databaseUrl));
}
