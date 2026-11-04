import * as Crypto from 'expo-crypto';
import {Buffer} from 'buffer';
const runtime=globalThis as unknown as {Buffer?:typeof Buffer;crypto?:{getRandomValues?:typeof Crypto.getRandomValues};window?:Record<string,unknown>};
runtime.Buffer??=Buffer;runtime.crypto??={};runtime.crypto.getRandomValues??=Crypto.getRandomValues;
runtime.window??=globalThis as unknown as Record<string,unknown>;
const site=(process.env.EXPO_PUBLIC_API_URL??'https://testnet.example.invalid').replace(/\/$/,'');
runtime.window.location??={href:site,hostname:new URL(site).hostname,origin:new URL(site).origin,protocol:'https:'};
runtime.window.addEventListener??=()=>{};runtime.window.removeEventListener??=()=>{};runtime.window.dispatchEvent??=()=>true;
