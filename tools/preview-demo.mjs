// Local-only visual QA of the Expo web export against the fictional Railway API.
// node tools/preview-demo.mjs artifacts/web-0.1.2
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const root=resolve(process.argv[2]||'artifacts/web-0.1.3');
const port=Number(process.env.OPENMINERALS_PREVIEW_PORT||8085);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local preview port');
await stat(resolve(root,'index.html'));
const upstreamUrl=new URL(process.env.OPENMINERALS_PREVIEW_API||'https://openminerals-api-demo.up.railway.app');
if(upstreamUrl.username||upstreamUrl.password||upstreamUrl.search||upstreamUrl.hash||upstreamUrl.pathname!=='/'||
  !(upstreamUrl.origin==='https://openminerals-api-demo.up.railway.app'||upstreamUrl.protocol==='http:'&&upstreamUrl.hostname==='127.0.0.1'))throw new Error('Preview API must be the demo Railway service or local loopback');
const upstream=upstreamUrl.origin;
const actions=new Set(['deposit','withdraw','convert','buy','sell','offer','cancel_offer','delivery','cancel_delivery','accounts/register','accounts/login','accounts/logout','mine/stock']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname.startsWith('/api/')||url.pathname==='/health'){
      const path=url.pathname;
      const permitted=req.method==='GET'&&(path==='/health'||path==='/api/demo/state'||path==='/api/demo/history'||path==='/api/demo/operator/summary'||path==='/api/demo/accounts/me'||path==='/api/demo/mine/summary'||/^\/api\/demo\/receipts\/[A-Za-z0-9_-]{8,100}$/.test(path)||/^\/api\/demo\/mine\/receipts\/[A-Za-z0-9_-]{8,100}\/[A-Za-z0-9_-]{8,100}$/.test(path))||
        req.method==='POST'&&actions.has(path.slice('/api/demo/'.length))&&path.startsWith('/api/demo/');
      if(!permitted){res.writeHead(403);res.end('Preview route unavailable');return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>16_384)throw new Error('Request too large');chunks.push(chunk);}
      const headers={'Content-Type':'application/json'};
      for(const key of ['x-demo-session','idempotency-key','authorization'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
      const response=await fetch(upstream+path+url.search,{method:req.method,headers,body:req.method==='POST'?Buffer.concat(chunks):undefined,signal:AbortSignal.timeout(15_000),redirect:'error'});
      const responseBody=Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(responseBody);return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:502,{'Content-Type':'text/plain'});res.end('Preview unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('Openminerals QA: http://127.0.0.1:'+port+' — fictional sessions only'));
