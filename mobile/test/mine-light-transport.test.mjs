import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Raster equality bounds verify the broad-light interpolation against actual
// r4 GLSL pixels. Timing samples are evidence, never a flaky speed assertion.
test('rough-light interpolation preserves r4 relief materials and image detail',{
  skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:90000,
},async()=>{
  const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(mobile),name='mine-light-transport-test-'+randomUUID(),out=path.join(repo,'artifacts',name);
  try{
    await promisify(execFile)(process.execPath,[path.join(mobile,'scripts/benchmark-mine-light-transport.mjs')],{cwd:repo,windowsHide:true,timeout:75000,maxBuffer:1024*1024,env:{...process.env,OPENMINERALS_MINE_LIGHT_TRANSPORT_DIR:path.join('artifacts',name)}});
    const report=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
    const [baseline,candidate]=report.results;assert.equal(baseline.id,'r4-full');assert.equal(candidate.id,'rough-light-transport');
    assert.deepEqual(baseline.work,candidate.work,'Same meshes, draw calls and phase visibility.');assert.equal(baseline.uploadBytes,candidate.uploadBytes,'No additional attributes or textures.');
    assert.equal(candidate.samples.length,baseline.samples.length);assert.equal(report.android,false);assert.equal(report.displayFpsMeasured,false);
    for(const image of candidate.images){
      assert.ok(image.difference.meanAbsoluteRgbError<1.2,'Mean channel error must stay below 1.2/255 at '+image.progress);
      assert.ok(image.difference.p95AbsoluteChannelError<=4,'At least95% RGB channels must stay within4/255 at '+image.progress);
      assert.ok(image.difference.pixelsOver6Percent<2,'Localized lighting changes must affect less than2% pixels at '+image.progress);
    }
    assert.equal(candidate.images.find(image=>image.progress===.67).difference.maxAbsoluteChannelError,0,'Metal-only stage must remain byte-identical.');
  }finally{
    assert.equal(path.dirname(path.resolve(out)),path.resolve(repo,'artifacts'));assert.ok(path.basename(out).startsWith('mine-light-transport-test-'));
    await rm(out,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
