import assert from 'node:assert/strict';
import {test} from 'node:test';
import {updateCheckNotice} from '../lib/update-message.ts';

test('OTA: an embedded session with no applicable update never claims a remote update was applied',()=>{
  for(const reason of ['noUpdateAvailableOnServer','updateRejectedBySelectionPolicy','rollbackRejectedBySelectionPolicy','unknown']){
    const message=updateCheckNotice({pending:false,embedded:true,reason});
    assert.match(message,/incluida en el APK/);assert.doesNotMatch(message,/última actualización|actualización aplicada/i);
  }
});
test('OTA: a downloaded revision is distinguished from the revision currently running',()=>{
  const running={embedded:false,updateId:'01a1857b-8ead-7eab-bf35-a0850d37caa8'};
  assert.match(updateCheckNotice({...running,pending:false}),/usa la actualización 01a1857b/);
  assert.match(updateCheckNotice({...running,pending:true}),/descargada.*completamente.*aplicarla/);
});
test('OTA: a previously failed update is reported without claiming the installation is up to date',()=>{
  const message=updateCheckNotice({pending:false,embedded:true,reason:'updatePreviouslyFailed'});
  assert.match(message,/no pudo iniciar/);assert.doesNotMatch(message,/última|aplicada/i);
  const pending=updateCheckNotice({pending:true,embedded:true,reason:'updatePreviouslyFailed'});
  assert.match(pending,/descargada/);
});
