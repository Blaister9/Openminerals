import test from 'node:test';
import {createStore} from '../src/store.js';
import {commercialMatrix} from './commercial-matrix-fixture.js';
test('Matriz completa: cuatro divisas y cuatro metales',async t=>{const store=await createStore('');try{await commercialMatrix(t,store);}finally{await store.close();}});
