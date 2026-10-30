import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {accountFlow} from '../e2e/account-lifecycle.mjs';
import {qualityFlow} from '../e2e/network-quality.mjs';
import {anonymousScreenshotAllowed} from '../e2e/ci-safety.mjs';

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
  assert.equal(excluded.length,3);assert.ok(excluded.every(pattern=>pattern.source.length<=240),'Grouped negative selectors remain within the public diagnostic bound.');
  for(const text of ['Cuenta','Sesión sin cuenta','Sesión anterior · solo consulta','Comprador · synthetic','Tu sesión anterior está vinculada a una cuenta y queda en consulta.','01/07','07 / 07','Ir a etapa 4: REFINACIÓN','MIS POSICIONES','COMPOSICIÓN DEL PORTAFOLIO','Cantidad de metal en gramos'])assert.ok(excluded.some(pattern=>pattern.test(text)),text);
  assert.ok(commands.some(command=>command.assertNotVisible?.id==='operations-scroll'));
  assert.ok(commands.every(command=>Object.keys(command).every(key=>['assertVisible','assertNotVisible'].includes(key))));
  assert.equal(excluded.some(pattern=>pattern.test('Etapa 4 de 7: REFINACIÓN')),false,'A meaningful spoken heading is distinct from a visual counter.');
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
    assert.equal(commands.filter(command=>command.runFlow?.file==='story-clean.yaml').length,2,'Full Home invariants are checked at origin and the overscrolled final scene.');
    for(let index=1;index<=7;index++)assert.ok(commands.some(command=>typeof command.tapOn==='string'&&command.tapOn.startsWith('Ir a etapa '+index+': ')));
    const end=commands.findIndex(command=>command.swipe?.from?.point==='80%,75%');assert.ok(end>0);
    assert.match(commands[end+1].assertVisible,/Etapa 7 de 7:/);assert.equal(commands[end+2].runFlow.file,'story-clean.yaml');
    assert.deepEqual(commands.filter(command=>command.repeat).map(command=>command.repeat.commands[0].swipe.direction),['UP','DOWN']);
    const readiness=name==='story'?'immersive-gl-ready':'immersive-scene-light';
    assert.ok(commands.some(command=>command.extendedWaitUntil?.visible?.id===readiness));
  }
});

test('native destination CTAs scroll separately to the real field and financial button without submitting',async()=>{
  const commands=await flow('story-exit');
  const cases=[
    ['Operar con metales DEMO','Mercado','^Cantidad de metal en gramos$','^Confirmar compra simulada$'],
    ['Saltar recorrido y continuar con la demo','Mercado','^Cantidad de metal en gramos$','^Confirmar compra simulada$'],
    ['Abrir mi portafolio','Metales','^Gramos para operación$','^Simular venta$',true],
    ['Abrir mi billetera','Billetera','^Cantidad de dinero para convertir$','^Convertir en demo$'],
  ];
  for(const [label,tab,field,button,blocked=false] of cases){
    const index=commands.findIndex(command=>isTap(command,label));assert.ok(index>=0,label);
    const after=commands.slice(index+1,index+8);
    assert.equal(after[0].extendedWaitUntil.notVisible.id,'home-cinematic-scroll');
    assert.equal(after[1].assertVisible.id,'operations-scroll');assert.equal(after[2].assertVisible,'^'+tab+'$');
    assert.equal(after[3].scrollUntilVisible.element.text,field);assert.equal(after[4].assertVisible,field);
    assert.equal(after[5].scrollUntilVisible.element.text,button);assert.equal(after[5].scrollUntilVisible.direction,'DOWN');
    assert.deepEqual(after[6].assertVisible,blocked?{text:button,enabled:false}:button);
    assert.equal(commands.some(command=>isTap(command,button)),false,'Anonymous destination checks never submit '+button);
  }
  assert.equal(nested(commands).some(command=>command.inputText),false);
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
  assert.equal(commands.some(command=>command.runFlow),false,'The recorded clip adds no repeated menu or composition checks.');
  const prepare=await flow('story-video-prepare');assert.ok(prepare.some(command=>command.extendedWaitUntil?.visible?.id==='immersive-gl-ready'));
});

test('full composition checks cover modes and resume without repeating every chapter preparation or login',async()=>{
  for(const name of ['story-video-prepare','story-light-prepare','story-resume-position','login'])assert.equal(nested(await flow(name)).some(command=>command.runFlow?.file==='story-clean.yaml'),false,name);
  for(const name of ['story-exit','story-resume-check','register'])assert.equal(nested(await flow(name)).filter(command=>command.runFlow?.file==='story-clean.yaml').length,1,name);
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
    assert.equal(commands.some(command=>command.runFlow?.file==='story-clean.yaml'),name!=='reenter',name);
  }
  const pending=nested(parse(qualityFlow('resolve')));
  const open=pending.findIndex(command=>isTap(command,'Operación pendiente · Resolver en Actividad'));
  assert.ok(open>0);assert.ok(pending.findIndex(command=>isTap(command,'^Reintentar operación pendiente$'))>open);
  const login=nested(await flow('login'));
  assert.ok(isTap(login[1],'^Actividad$'));
});

test('pre-OTA preservation scrolls to stable metal quantities and retains wallet receipt and history assertions',async()=>{
  const raw=await source('../e2e/native/preserve.yaml'),commands=parse(raw);
  const metals=commands.findIndex(command=>isTap(command,'^Metales$'));
  const quantity=commands.findIndex(command=>command.assertVisible==='^0,000 g$');
  assert.ok(metals>=0&&quantity>metals);
  assert.equal(commands[quantity-1].scrollUntilVisible.element.text,'^0,000 g$');
  assert.equal(commands[quantity-1].scrollUntilVisible.direction,'DOWN');
  assert.doesNotMatch(raw,/Todavía no tienes posiciones|PortfolioComposition/,'The required OTA has not yet been enforced at this stage.');
  assert.equal(commands.filter(command=>command.extendedWaitUntil?.visible==='^USDT 268,40$').length,2);
  assert.ok(commands.some(command=>command.assertVisible==='^Saldo USDT después$'));
  assert.ok(commands.some(command=>command.scrollUntilVisible?.element?.text==='^USDT 196,77$'));
  assert.ok(commands.some(command=>command.scrollUntilVisible?.element?.text?.includes('3\\s+de\\s+3')));
});

test('geological narrative keeps seven exact spoken chapters and real chapter menu destinations',async()=>{
  const labels=['MINA','EXTRACCIÓN','PROCESAMIENTO','REFINACIÓN','FORMACIÓN DEL LINGOTE','CUSTODIA VIRTUAL','FRACCIONAMIENTO DIGITAL'];
  for(const name of ['story','story-light']){
    const commands=await flow(name);
    for(const [index,label] of labels.entries()){
      assert.ok(commands.some(command=>command.tapOn==='Ir a etapa '+(index+1)+': '+label),name+': '+label);
      assert.ok(commands.some(command=>command.assertVisible==='Etapa '+(index+1)+' de 7: '+label),name+': '+label);
    }
  }
  for(const name of ['story-performance-complete','story-performance-light-complete'])assert.equal((await flow(name))[0].extendedWaitUntil.visible,'Etapa 7 de 7: FRACCIONAMIENTO DIGITAL');
});

test('four material selections assert exclusive state and draw readiness with menus closed before anonymous PNGs',async()=>{
  const commands=await flow('story-metals'),materials=[['XAU','Oro'],['XAG','Plata'],['XPT','Platino'],['XPD','Paladio']];
  const taps=commands.flatMap(command=>typeof command.tapOn==='string'&&command.tapOn.startsWith('Representar ')?[command.tapOn]:[]);
  assert.deepEqual(taps,['Representar Oro','Representar Plata','Representar Platino','Representar Paladio','Representar Oro']);
  for(const [code,label] of materials){
    const index=commands.findIndex(command=>command.tapOn==='Representar '+label),after=commands.slice(index+1);
    assert.deepEqual(after[0].assertVisible,{text:'Representar '+label,selected:true});
    for(const [,other] of materials.filter(([otherCode])=>otherCode!==code))assert.ok(after.slice(1,4).some(command=>command.assertVisible?.text==='Representar '+other&&command.assertVisible.selected===false));
    const screenshot=commands.findIndex(command=>command.takeScreenshot==='safe-material-'+code);
    assert.ok(screenshot>index);assert.equal(commands[screenshot-1].extendedWaitUntil.visible.id,'immersive-gl-ready');
    assert.equal(commands[screenshot-1].extendedWaitUntil.visible.text,'^'+label+' DEMO\\..*');
    assert.equal(commands[screenshot-2].assertVisible,'Etapa 5 de 7: FORMACIÓN DEL LINGOTE');
    assert.equal(commands[screenshot-3].assertNotVisible,'Cerrar opciones del recorrido');
  }
  assert.deepEqual(commands.filter(command=>command.takeScreenshot).map(command=>command.takeScreenshot),materials.map(([code])=>'safe-material-'+code));
  assert.equal(commands.at(-1).extendedWaitUntil.visible.text,'^Oro DEMO\\..*');
  assert.equal(nested(commands).some(command=>command.inputText||command.launchApp||command.stopApp),false);
});

test('material PNG approval is closed to exactly four names and the pre-credential material flow',()=>{
  for(const code of ['XAU','XAG','XPT','XPD']){
    assert.equal(anonymousScreenshotAllowed('story-metals','safe-material-'+code+'.png'),true);
    for(const scope of ['profile','story','story-exit','operator','register','../story-metals'])assert.equal(anonymousScreenshotAllowed(scope,'safe-material-'+code+'.png'),false);
  }
  for(const name of ['safe-material-XAU.png.exe','safe-material-XAU-extra.png','safe-material-OTHER.png','../safe-material-XAU.png'])assert.equal(anonymousScreenshotAllowed('story-metals',name),false);
});

test('material coverage remains outside measurement and before native account credential entry',async()=>{
  const runner=await source('../e2e/ci-android.mjs'),ast=ts.createSourceFile('ci-android.mjs',runner,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const stages=[];function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='runStage')stages.push(node);ts.forEachChild(node,visit);}visit(ast);
  const material=stages.filter(node=>node.arguments[0]?.text==='native-four-metal-materials');assert.equal(material.length,2);
  const registration=stages.find(node=>node.arguments[0]?.text==='native-registration-no-import');assert.ok(registration);
  for(const stage of material){assert.equal(stage.arguments[1].getText(ast),'runAnonymousMaterials');assert.ok(stage.getStart(ast)<registration.getStart(ast));}
  const performance=await source('../e2e/immersive-performance.mjs');assert.doesNotMatch(performance,/story-metals|Representar |safe-material/);
});
