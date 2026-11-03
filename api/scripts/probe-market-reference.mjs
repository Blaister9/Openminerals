// Public, read-only provider probe. No account, key, order or wallet endpoint.
import {createMarketService} from '../src/market/service.js';
const service=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true',MARKET_USDT_USE_ALLOWED:process.env.MARKET_USDT_USE_ALLOWED}});
const result=await service.exchange();
console.log(JSON.stringify({observedAt:new Date().toISOString(),metalsCredentialSupplied:false,frequencyVerified:false,result},null,2));
if(!['current','delayed'].includes(result.fiat.status)||!['current','delayed','permission-required'].includes(result.usdt.status))process.exitCode=1;
