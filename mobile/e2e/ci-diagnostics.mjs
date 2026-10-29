import {lstat,readFile,opendir} from 'node:fs/promises';
import {join} from 'node:path';

// Only repository-defined selectors are returned. Never return a raw log line.
export function flowSelectors(text){
  return [...new Set(text.split(/\r?\n/).flatMap(line=>{
    const match=line.match(/^\s*(?:-\s*)?(?:tapOn|text|visible|notVisible|assertVisible|assertNotVisible):\s*(.+)$/);
    if(!match)return [];
    let value=match[1].trim();
    if(value.startsWith('"')){try{value=JSON.parse(value);}catch{return [];}}
    else if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1).replaceAll("''","'");
    return typeof value==='string'&&value.length<=240&&!value.includes('$'+'{')&&!value.startsWith('{')?[value]:[];
  }))];
}
const normalize=value=>value.replace(/\x1b\[[0-9;]*m/g,'').replace(/^\(\?i\)/,'').replace(/^\^|\$$/g,'').replace(/\\s\+/g,' ').replace(/\.\*/g,'').trim().toLowerCase();
export function failureDiagnostic(log,selectors){
  // The first exception can precede hundreds of stack frames. Retaining only
  // the tail loses both its category and its static selector.
  const lines=log.split(/\r?\n/);
  const failures=lines.filter(line=>/FAILED|FAILURE|❌|Assertion.*false|not found|timed out|Exception|Error/i.test(line));
  const focus=lines.join('\n');
  const category=/Broken pipe|DeadSystem|WATCHDOG|INSTALL_FAILED|device.*offline|MaestroDriver|adb.*error/i.test(focus)?'android-driver-or-system':
    /Invalid Flow|FlowParseError|YamlParseException|JsonParseException|JsonMappingException|InvalidFormatException|Unrecognized (?:field|property)|Unknown command|Failed to parse|Could not parse|Cannot deserialize|flow.{0,120}does not exist|No flows? (?:were )?found/i.test(focus)?'flow-definition-error':
    /Unknown options?|Unmatched arguments?|Missing required (?:option|parameter)|Invalid value for option/i.test(focus)?'cli-configuration-error':
    /timed out|Timeout/i.test(focus)?'timeout':
    /not found|No visible element|Unable to find/i.test(focus)?'selector-not-found':
    /Assertion.*false|assert.*fail/i.test(focus)?'assertion-failed':'native-command-failed';
  const matching=(line)=>selectors.filter(selector=>{const value=normalize(selector);return value.length>=4&&normalize(line).includes(value);});
  const expected=[...new Set(failures.flatMap(matching))].slice(-3);
  const recent=lines.flatMap(line=>matching(line).map(selector=>({
    selector,status:/✅|COMPLETED|PASSED/i.test(line)?'passed':/FAILED|❌|Assertion.*false/i.test(line)?'failed':'mentioned',
  }))).slice(-6);
  return {category,expectedSelectorsFromFlow:expected,recentStaticCommandLabels:recent,rawDiagnosticsPublished:false};
}

// Keys/statuses come from Maestro 2.12's public command/debug model. Values,
// evaluatedCommand, errors, descriptions, paths and hierarchy never escape.
const commandTypes=new Map([
  ['tapOnElement','tap'],['tapOnPointV2Command','tap-point'],['scrollCommand','scroll'],['swipeCommand','swipe'],
  ['scrollUntilVisible','scroll-until-visible'],['assertConditionCommand','assert'],['inputTextCommand','input-text'],
  ['eraseTextCommand','erase-text'],['hideKeyboardCommand','hide-keyboard'],['launchAppCommand','launch-app'],
  ['stopAppCommand','stop-app'],['runFlowCommand','run-flow'],['applyConfigurationCommand','configuration'],
  ['waitForAnimationToEndCommand','wait-animation'],['takeScreenshotCommand','screenshot'],['repeatCommand','repeat'],
  ['evalScriptCommand','eval-script'],['defineVariablesCommand','variables'],['backPressCommand','back'],
]);
const commandStatuses=new Set(['PENDING','RUNNING','COMPLETED','FAILED','SKIPPED','WARNED']);
function commandDiagnostic(entries,selectors){
  if(!Array.isArray(entries))return {rows:[],errors:[]};
  const rows=[],errors=[];
  for(const [index,entry] of entries.slice(0,10000).entries()){
    const command=entry?.command,metadata=entry?.metadata;
    if(!command||typeof command!=='object'||!metadata||typeof metadata!=='object')continue;
    const key=[...commandTypes.keys()].find(key=>Object.hasOwn(command,key)&&command[key]!==null);
    const value=key?command[key]:null;
    const candidates=[value?.selector?.textRegex,value?.condition?.visible?.textRegex,value?.condition?.notVisible?.textRegex];
    const selector=candidates.find(value=>typeof value==='string'&&selectors.includes(value));
    rows.push({index:index+1,type:commandTypes.get(key)??'other',status:commandStatuses.has(metadata.status)?metadata.status:'UNKNOWN',...(selector?{selector}:{})});
    for(const field of ['message','debugMessage'])if(typeof metadata.error?.[field]==='string')errors.push(metadata.error[field].slice(0,16384));
  }
  return {rows,errors};
}

// Read only diagnostic text/command files in this invocation's private folder.
// No screenshot, hierarchy, symlink, arbitrary file name or raw content is
// included in the returned object; file/size limits bound malformed bundles.
export async function collectFailureDiagnostic(directory,selectors){
  const texts=[],rows=[],sources={console:false,junit:false,commands:false,maestroLog:false};
  let files=0,bytes=0,skippedFiles=0,directories=0,entriesVisited=0,truncated=false;
  async function walk(path,depth=0){
    if(truncated)return;
    if(depth>7||directories>=128){truncated=true;return;}
    directories++;
    let entries;try{const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isDirectory())return;entries=await opendir(path);}catch{return;}
    // Streaming avoids materializing an arbitrarily wide directory before the
    // global traversal budget can be checked. Early return closes the iterator.
    for await(const entry of entries){
      if(truncated)return;
      if(entriesVisited>=2048){truncated=true;return;}
      entriesVisited++;
      if(entry.isSymbolicLink())continue;
      const file=join(path,entry.name);
      if(entry.isDirectory()){if(!['screen-hierarchy','takeScreenshot','startRecording','assert-screenshot','ai-analysis'].includes(entry.name))await walk(file,depth+1);continue;}
      if(!entry.isFile())continue;
      const kind=entry.name==='console.txt'?'console':entry.name==='raw-report.xml'?'junit':/^commands(?:-\(.+\))?\.json$/.test(entry.name)?'commands':entry.name==='maestro.log'?'maestroLog':null;
      if(!kind)continue;
      if(++files>80){skippedFiles++;truncated=true;return;}
      let text;try{
        const stat=await lstat(file);
        if(stat.isSymbolicLink()||stat.size>2*1024*1024||bytes+stat.size>8*1024*1024){skippedFiles++;continue;}
        text=await readFile(file,'utf8');bytes+=stat.size;
      }catch{skippedFiles++;continue;}
      sources[kind]=true;
      if(kind==='commands'){
        try{const result=commandDiagnostic(JSON.parse(text),selectors);rows.push(...result.rows);texts.push(...result.errors);}catch{skippedFiles++;}
      }else texts.push(text);
    }
  }
  await walk(directory);
  const diagnostic=failureDiagnostic(texts.join('\n'),selectors);
  const firstFailedCommand=rows.find(row=>row.status==='FAILED')??null;
  if(firstFailedCommand?.selector&&!diagnostic.expectedSelectorsFromFlow.includes(firstFailedCommand.selector))diagnostic.expectedSelectorsFromFlow.push(firstFailedCommand.selector);
  if(firstFailedCommand&&diagnostic.category==='native-command-failed')diagnostic.category='command-execution-failed';
  return {...diagnostic,diagnosticSources:sources,firstFailedCommand,recentCommands:rows.slice(-12),skippedDiagnosticFiles:skippedFiles,diagnosticTraversalTruncated:truncated};
}
