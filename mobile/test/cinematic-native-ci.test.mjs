import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {accountFlow} from '../e2e/account-lifecycle.mjs';
import {qualityFlow} from '../e2e/network-quality.mjs';

const yaml=createRequire(import.meta.url)('yaml');
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const parse=text=>{const documents=yaml.parseAllDocuments(text);assert.equal(documents.length,2);assert.ok(documents.every(document=>document.errors.length===0));return documents[1].toJSON();};
const flow=async name=>parse(await source('../e2e/native/'+name+'.yaml'));
const nested=commands=>commands.flatMap(command=>[command,...nested(command?.runFlow?.commands??command?.repeat?.commands??[])]);
const isTap=(command,text)=>command?.tapOn===text||command?.tapOn?.text===text;

test('native Home guard checks visible scene and tabs while excluding account cards chapter counter and operation footer',async()=>{
  const commands=await flow('story-clean');
  for(const id of ['home-cinematic-scroll','immersive-stage'])assert.ok(commands.some(command=>command.assertVisible?.id===id));
  for(const tab of ['Inicio','Mercado','Billetera','Metales','Actividad'])assert.ok(commands.some(command=>command.assertVisible==='^'+tab+'$'));
  const excluded=commands.map(command=>command.assertNotVisible).filter(value=>typeof value==='string').map(value=>new RegExp(value));
  for(const text of ['Cuenta','Sesión sin cuenta','Sesión anterior · solo consulta','Comprador · synthetic','Tu sesión anterior está vinculada a una cuenta y queda en consulta.','01/07','07 / 07','Ir a etapa 4: FORMACIÓN DEL LINGOTE','MIS POSICIONES','COMPOSICIÓN DEL PORTAFOLIO','Cantidad de metal en gramos'])assert.ok(excluded.some(pattern=>pattern.test(text)),text);
  assert.ok(commands.some(command=>command.assertNotVisible?.id==='operations-scroll'));
  assert.ok(commands.every(command=>Object.keys(command).every(key=>['assertVisible','assertNotVisible'].includes(key))));
  assert.equal(excluded.some(pattern=>pattern.test('Etapa 4 de 7: FORMACIÓN DEL LINGOTE')),false,'A meaningful spoken heading is distinct from a visual counter.');
});

test('anonymous narrative closes its real options before screenshots and checks end-of-story overscroll without a footer',async()=>{
  for(const name of ['story','story-light']){
    const commands=await flow(name);let options=false;const snapshots=[];
    for(const command of commands){
      if(isTap(command,'Opciones del recorrido'))options=true;
      if(isTap(command,'Cerrar opciones del recorrido')||typeof command.tapOn==='string'&&command.tapOn.startsWith('Ir a etapa '))options=false;
      if(command.takeScreenshot){assert.equal(options,false);snapshots.push(command.takeScreenshot);}
    }
    assert.deepEqual(snapshots,name==='story'?Array.from({length:7},(_,index)=>'safe-story-'+(index+1)):[]);
    for(let index=1;index<=7;index++)assert.ok(commands.some(command=>typeof command.tapOn==='string'&&command.tapOn.startsWith('Ir a etapa '+index+': ')));
    const end=commands.findIndex(command=>command.swipe?.from?.point==='80%,75%');assert.ok(end>0);
    assert.match(commands[end+1].assertVisible,/Etapa 7 de 7:/);assert.equal(commands[end+2].runFlow.file,'story-clean.yaml');
    assert.deepEqual(commands.filter(command=>command.repeat).map(command=>command.repeat.commands[0].swipe.direction),['UP','DOWN']);
    const readiness=name==='story'?'immersive-gl-ready':'immersive-scene-light';
    assert.ok(commands.some(command=>command.extendedWaitUntil?.visible?.id===readiness));
  }
});

test('native Operar and skip both leave the cinematic scroll for the actual purchase screen',async()=>{
  const commands=await flow('story-exit');
  for(const label of ['Operar con metales DEMO','Saltar recorrido y continuar con la demo']){
    const index=commands.findIndex(command=>isTap(command,label));assert.ok(index>=0,label);
    const after=commands.slice(index+1,index+6);
    assert.equal(after[0].extendedWaitUntil.notVisible.id,'home-cinematic-scroll');
    assert.equal(after[1].assertVisible.id,'operations-scroll');assert.equal(after[2].assertVisible,'^Mercado$');
    assert.equal(after[3].scrollUntilVisible.element.text,'^Cantidad de metal en gramos$');assert.equal(after[4].assertVisible,'^Confirmar compra simulada$');
  }
});

test('anonymous video uses only slow real swipes and verifies reversal and final scene without menus or cuts',async()=>{
  const commands=await flow('story-video');
  assert.match(commands[0].assertVisible,/Etapa 1 de 7:/);
  const gestures=commands.filter(command=>command.repeat).map(command=>command.repeat);
  assert.deepEqual(gestures.map(value=>value.commands[0].swipe.start),['80%,80%','80%,18%','80%,80%']);
  assert.ok(gestures.every(value=>value.commands[0].swipe.duration>=1500&&value.times<=6));
  assert.match(gestures[1].while.notVisible,/Etapa 1 de 7:/);assert.match(gestures[2].while.notVisible,/Etapa 7 de 7:/);
  assert.ok(commands.some(command=>command.assertVisible==='Operar con metales DEMO'));
  assert.ok(commands.some(command=>typeof command.extendedWaitUntil?.visible==='string'&&command.extendedWaitUntil.visible.startsWith('Etapa 7 de 7:')));
  assert.ok(nested(commands).every(command=>!command.tapOn&&!command.takeScreenshot&&!command.inputText));
  assert.ok(commands.filter(command=>command.runFlow).every(command=>command.runFlow.file==='story-clean.yaml'));
  const prepare=await flow('story-video-prepare');assert.ok(prepare.some(command=>command.extendedWaitUntil?.visible?.id==='immersive-gl-ready'));
});

test('Home content stays standalone and its real skip handler selects Mercado',async()=>{
  const text=await source('../App.tsx'),ast=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let home;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='home')home=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(home);
  const tags=[];let skip;
  function inspect(node){
    if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node)){
      tags.push(node.tagName.getText(ast));
      if(node.tagName.getText(ast)==='MetalStory')skip=node.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(ast)==='onSkip')?.initializer?.expression;
    }
    ts.forEachChild(node,inspect);
  }
  inspect(home);assert.equal(tags.filter(tag=>tag==='MetalStory').length,1);
  assert.equal(tags.some(tag=>['Card','Text','PortfolioComposition','PositionRail','BalanceRail','Button'].includes(tag)),false,'Operational content belongs on its own tabs.');
  assert.ok(skip);const targets=[],context=vm.createContext({openHomeAction:target=>targets.push(target)});vm.runInContext('this.skip='+skip.getText(ast),context);context.skip();assert.deepEqual(targets,['Mercado']);
});

test('cold-launch and account continuations reach Actividad before checking an identity removed from Home',async()=>{
  for(const name of ['operator-navigation-ota','ota-before-story','ota','profile']){
    const commands=await flow(name);
    for(let index=0;index<commands.length;index++)if(commands[index]==='launchApp'){
      assert.equal(commands[index+1].extendedWaitUntil.visible,'^Actividad$',name);
      assert.ok(isTap(commands[index+2],'^Actividad$'),name);
    }
  }
  for(const name of ['import','hide-and-logout','reenter']){
    const commands=parse(accountFlow(name));
    for(let index=0;index<commands.length;index++)if(commands[index].extendedWaitUntil?.visible==='^Comprador ·.*'||commands[index].extendedWaitUntil?.visible==='^Sesión anterior · solo consulta$')assert.ok(isTap(commands[index-1],'^Actividad$'),name);
    assert.ok(commands.some(command=>command.runFlow?.file==='story-clean.yaml'),name);
  }
  const pending=nested(parse(qualityFlow('resolve')));
  const open=pending.findIndex(command=>isTap(command,'Operación pendiente · Resolver en Actividad'));
  assert.ok(open>0);assert.ok(pending.findIndex(command=>isTap(command,'^Reintentar operación pendiente$'))>open);
  const login=nested(await flow('login'));
  assert.ok(isTap(login[1],'^Actividad$'));assert.ok(login.some(command=>command.runFlow?.file==='story-clean.yaml'));
});
