import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if(!process.env.TEST_DATABASE_URL){
  console.error('Falta TEST_DATABASE_URL. No se ejecutó ni validó PostgreSQL.');
  process.exitCode=1;
}else{
  const result=spawnSync(process.execPath,['--test',...['postgres','accounts-postgres','custody-postgres','marketplace-postgres','delivery-postgres'].map(name=>fileURLToPath(new URL(`../test/${name}.test.js`,import.meta.url)))],{
    stdio:'inherit',env:process.env,
  });
  if(result.error)console.error('No se pudo iniciar la prueba PostgreSQL:',result.error.message);
  process.exitCode=result.status??1;
}
