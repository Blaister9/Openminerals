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
  const lines=log.split(/\r?\n/).slice(-100);
  const failures=lines.filter(line=>/FAILED|FAILURE|❌|Assertion.*false|not found|timed out|Exception|Error/i.test(line));
  const focus=failures.slice(-12).join('\n');
  const category=/Broken pipe|DeadSystem|WATCHDOG|INSTALL_FAILED|device.*offline|MaestroDriver|adb.*error/i.test(focus)?'android-driver-or-system':
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
