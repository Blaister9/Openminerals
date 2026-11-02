import {isIP} from 'node:net';

// Opt in only behind Railway's public HTTP edge, with no direct public TCP path.
// Never trust client-supplied forwarding headers on an arbitrary local deployment.
export function referenceRateKey(req,trustRailwayProxy=false){
  const peer=req.socket.remoteAddress||'unknown',forwarded=req.headers['x-real-ip'];
  return trustRailwayProxy&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer;
}
