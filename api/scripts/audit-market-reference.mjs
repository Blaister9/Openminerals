// Manual, read-only deployment audit; never use against the commercial service.
import pg from 'pg';
const expected={project:'1442be94-b13f-4067-9fee-ea99caf5715a',environment:'c4c1afd1-2ed7-40e1-8955-f173a6880518',service:'373995aa-3925-4e3e-a74b-7ca652bb713e'};
let pool,client;
try{
  if(process.env.RAILWAY_PROJECT_ID!==expected.project||process.env.RAILWAY_ENVIRONMENT_ID!==expected.environment||process.env.RAILWAY_SERVICE_ID!==expected.service)throw new Error('ISOLATED_MARKET_ENVIRONMENT_REQUIRED');
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:8000});client=await pool.connect();
  await client.query('BEGIN READ ONLY');
  const database=(await client.query('SELECT current_database() AS name')).rows[0].name;
  if(database!=='openminerals_market_reference')throw new Error('ISOLATED_MARKET_DATABASE_REQUIRED');
  const tables=(await client.query("SELECT to_regclass('reference_market_cache') IS NOT NULL AS cache, to_regclass('reference_provider_usage') IS NOT NULL AS usage")).rows[0];
  const cache=tables.cache?(await client.query("SELECT key, value->>'retrievedAt' AS retrieved_at, value->>'cacheUntil' AS cache_until FROM reference_market_cache ORDER BY key")).rows:[];
  const usage=tables.usage?(await client.query('SELECT provider,day::text,count FROM reference_provider_usage ORDER BY provider,day')).rows:[];
  await client.query('COMMIT');
  console.log(JSON.stringify({observedAt:new Date().toISOString(),demoOnly:true,readOnly:true,database,environmentId:expected.environment,apiServiceId:expected.service,deploymentId:process.env.RAILWAY_DEPLOYMENT_ID,
    configured:{metalsKey:!!process.env.METALS_DEV_API_KEY,metalsDisplay:process.env.MARKET_METALS_DISPLAY_ALLOWED==='true',metalsStorage:process.env.MARKET_METALS_STORAGE_ALLOWED==='true',usdtUse:process.env.MARKET_USDT_USE_ALLOWED==='true'},cache,usage},null,2));
}catch(error){console.error('Market audit failed:',error.code||error.name);process.exitCode=1;}finally{client?.release();await pool?.end();}
