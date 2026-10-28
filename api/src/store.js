import {seedState,applyCommand} from './domain.js';

const ID_PATTERN=/^[A-Za-z0-9_-]{16,100}$/;
export function validateSessionId(id){
  if(typeof id!=='string'||!ID_PATTERN.test(id)) throw Object.assign(new Error('Sesión demo inválida'),{status:400});
  return id;
}

// PostgreSQL guarda una sesión por fila JSONB. FOR UPDATE serializa las operaciones
// de cada sesión de demo. NO sustituye el ledger contable de producción.
export async function createStore(databaseUrl=process.env.DATABASE_URL){
  if(!databaseUrl){
    if(process.env.REQUIRE_DATABASE==='true') throw new Error('REQUIRE_DATABASE activo pero no hay DATABASE_URL');
    const sessions=new Map();
    const get=id=> {validateSessionId(id); if(!sessions.has(id)) sessions.set(id,seedState()); return structuredClone(sessions.get(id));};
    return {
      mode:'memory-demo',
      async ping(){return true;},
      async get(id){return get(id);},
      async mutate(id,command){const current=get(id);const result=applyCommand(current,command);if(result.changed)sessions.set(id,result.state);return result;},
      async reset(id){validateSessionId(id);sessions.set(id,seedState());return get(id);},
      async close(){}
    };
  }
  const {default:pg}=await import('pg');
  const {Pool}=pg;
  const pool=new Pool({connectionString:databaseUrl,max:8,connectionTimeoutMillis:8000});
  await pool.query(`CREATE TABLE IF NOT EXISTS demo_sessions (
    id TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  async function ensure(client,id){
    await client.query('INSERT INTO demo_sessions (id,state) VALUES ($1,$2::jsonb) ON CONFLICT (id) DO NOTHING',[id,JSON.stringify(seedState())]);
  }
  return {
    mode:'postgres-demo',
    async ping(){await pool.query('SELECT 1'); return true;},
    async get(id){
      validateSessionId(id);
      const client=await pool.connect();
      try {await ensure(client,id);const r=await client.query('SELECT state FROM demo_sessions WHERE id=$1',[id]);return r.rows[0].state;}
      finally {client.release();}
    },
    async mutate(id,command){
      validateSessionId(id);
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await ensure(client,id);
        const row=await client.query('SELECT state FROM demo_sessions WHERE id=$1 FOR UPDATE',[id]);
        const result=applyCommand(row.rows[0].state,command);
        if(result.changed) await client.query('UPDATE demo_sessions SET state=$2::jsonb,updated_at=NOW() WHERE id=$1',[id,JSON.stringify(result.state)]);
        await client.query('COMMIT');
        return result;
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    async reset(id){
      validateSessionId(id);
      await pool.query('INSERT INTO demo_sessions(id,state) VALUES ($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()',[id,JSON.stringify(seedState())]);
      return this.get(id);
    },
    async close(){await pool.end();}
  };
}
