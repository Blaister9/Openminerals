export function memoryMarketRepository(){
  const cache=new Map(),usage=new Map();
  return {async get(key){return structuredClone(cache.get(key));},async put(key,value){if(cache.size>=600&&!cache.has(key))cache.delete(cache.keys().next().value);cache.set(key,structuredClone(value));},
    async reserve(provider,limit,now){const key=provider+':'+new Date(now).toISOString().slice(0,10);const count=usage.get(key)||0;if(count>=limit)return false;usage.set(key,count+1);for(const old of usage.keys())if(Date.parse(old.slice(-10))<now-400*86400000)usage.delete(old);return true;}};
}
export async function postgresMarketRepository(pool){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('openminerals-reference-market-init-v1'))");
    await client.query(`CREATE TABLE IF NOT EXISTS reference_market_cache(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS reference_provider_usage(provider TEXT NOT NULL,day DATE NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(provider,day));`);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return {
    async get(key){return (await pool.query('SELECT value FROM reference_market_cache WHERE key=$1',[key])).rows[0]?.value;},
    async put(key,value){await pool.query('INSERT INTO reference_market_cache(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[key,JSON.stringify(value)]);await pool.query("DELETE FROM reference_market_cache WHERE updated_at<NOW()-INTERVAL '7 days'");},
    async reserve(provider,limit,now){
      const row=(await pool.query(`INSERT INTO reference_provider_usage(provider,day,count) VALUES($1,$2,1)
        ON CONFLICT(provider,day) DO UPDATE SET count=reference_provider_usage.count+1 WHERE reference_provider_usage.count<$3 RETURNING count`,[provider,new Date(now).toISOString().slice(0,10),limit])).rows[0];return !!row;
    },
  };
}
