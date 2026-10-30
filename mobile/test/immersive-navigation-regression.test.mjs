import test from 'node:test';
import assert from 'node:assert/strict';
import {horizontalWalletNavigation} from '../e2e/wallet-navigation.mjs';
import {accountFlow} from '../e2e/account-lifecycle.mjs';
import {redactedJavascriptFailure} from '../e2e/ci-native-failure.mjs';
import {PACKAGE} from '../e2e/ci-safety.mjs';

test('USDT account scenario opens a distinct wallet helper rather than recursing',()=>{
 const result=horizontalWalletNavigation(accountFlow('wallet','USDT'));
 const commands=JSON.parse(result.split('\n---\n')[1]);
 assert.deepEqual(commands[1],{runFlow:{file:'wallet-balance-rail.yaml'}});
 assert.equal(commands.filter(command=>command.inputText==='1,25').length,1);
 assert.doesNotMatch(result,/file.*wallet-usdt\.yaml/);
});
test('JavaScript failure metadata excludes identities, opaque tokens, URLs and foreign processes',()=>{
 const alias='private_demo_identity',token='secretToken'.repeat(6),id='11111111-1111-4111-8111-111111111111';
 const text='FATAL EXCEPTION: main\nProcess: '+PACKAGE+', PID: 12\nE/AndroidRuntime: com.facebook.react.common.JavascriptException: TypeError: '+alias+' '+token+' '+id+' https://invalid.example/token '+"'private profile' property 'translateY'";
 const result=redactedJavascriptFailure(text,[alias]);
 for(const secret of [alias,token,id,'https://invalid.example/token','private profile'])assert.ok(!result.message.includes(secret));
 assert.match(result.message,/translateY/);assert.equal(result.rawLogsPublished,false);
 assert.equal(redactedJavascriptFailure(text.replace(PACKAGE,'another.process'),[alias]),null);
});
