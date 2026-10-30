import test from 'node:test';
import assert from 'node:assert/strict';
import {horizontalWalletNavigation} from '../e2e/wallet-navigation.mjs';
import {accountFlow} from '../e2e/account-lifecycle.mjs';
import {redactedJavascriptFailure} from '../e2e/ci-native-failure.mjs';
import {PACKAGE} from '../e2e/ci-safety.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('3D layout survives a recycled native event before the state updater runs',async()=>{
 const source=await readFile(new URL('../components/GoldBar3D.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('GoldBar3D.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;
 function visit(node){if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onLayout')handler=node.initializer.expression;ts.forEachChild(node,visit);}
 visit(ast);assert.ok(handler);
 const queued=[],context=vm.createContext({setWidth:updater=>queued.push(updater),Math});
 vm.runInContext('this.layout='+handler.getText(ast),context);
 const event={nativeEvent:{layout:{width:360}}};context.layout(event);event.nativeEvent=null;
 assert.equal(queued[0](320),360);assert.equal(queued[0](360.2),360.2);
});

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
