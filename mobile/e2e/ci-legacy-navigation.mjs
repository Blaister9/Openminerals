// Baseline 0.1.3 diagnostic hypothesis only. The new APK always keeps normal bars.
import {PACKAGE} from './ci-safety.mjs';
const temporary='immersive.navigation='+PACKAGE;
export async function withLegacyNavigation(adb,run,onRestored=async()=>{}){
  const info=adb('shell','dumpsys','package',PACKAGE);
  if(!/\bversionCode=4\b/.test(info))throw new Error('Legacy navigation workaround requires baseline versionCode4.');
  if(adb('shell','settings','get','global','policy_control')!=='null')throw new Error('Legacy navigation workaround requires an untouched navigation policy.');
  try{
    adb('shell','settings','put','global','policy_control',temporary);
    if(adb('shell','settings','get','global','policy_control')!==temporary)throw new Error('Legacy navigation policy was not applied.');
    return await run();
  }finally{
    // Also runs if the put/check or the flow fails. No uninstall or data clear.
    adb('shell','settings','delete','global','policy_control');
    const restored=adb('shell','settings','get','global','policy_control')==='null';
    await onRestored({demoOnly:true,baselineVersionCode:4,initialPolicy:'null',temporaryPolicy:temporary,restoredToNull:restored,overlapHypothesisOnly:true,newApkRequiresNormalBars:true});
    if(!restored)throw new Error('Legacy navigation policy was not restored; updating is prohibited.');
  }
}
