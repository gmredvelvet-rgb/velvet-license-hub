const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/license.js'),'utf8');
const login='https://www.patreon.com/oauth2/authorize?fixture';
function harness(desktop,popup={closed:false,close(){this.closed=true;}}){
  const opened=[],requests=[],events=new Map(),timers=[];
  const context=vm.createContext({
    MODULE_ID:'velvet-license-hub',MODULE_TITLE:'Velvet License Hub',localize:key=>key,
    SETTING:'worldLicence',worldLicence:()=>({until:0,modules:[]}),
    location:{origin:'https://table.example'},velvetOverlay:desktop,crypto:crypto.webcrypto,URL,console,
    window:{open(...args){opened.push(args);return popup;},addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}},
    setInterval(fn,ms){timers.push({fn,ms});return timers.length;},clearInterval(){},setTimeout(){},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({url:login})};},
  });
  vm.runInContext(source.replace(/^import .*;\r?$/gm,'').replace(/^export default class /gm,'class ').replace(/^export /gm,'')+'\nglobalThis.Client=LicenseClient;',context);
  return{client:new context.Client(),opened,requests,events,timers};
}
test('desktop sign-in opens the system browser and requests manual code entry without a popup or polling',async()=>{
  const urls=[];const h=harness({async openLicenseSignIn(url){urls.push(url);return true;}});
  assert.equal(await h.client.startOAuth(),'external');assert.deepEqual(urls,[login]);assert.deepEqual(h.opened,[]);assert.equal(h.events.size,0);assert.equal(h.timers.length,0);
  assert.equal(h.requests[0].body.moduleId,'velvet-license-hub');assert.equal(h.requests[0].body.origin,'https://table.example');
});
test('desktop browser failure is reported and cannot be mistaken for successful activation',async()=>{
  for(const openLicenseSignIn of [async()=>false,async()=>{throw Error('No browser');}]){
    const h=harness({openLicenseSignIn});await assert.rejects(h.client.startOAuth());assert.equal(h.opened.length,0);assert.equal(h.timers.length,0);
  }
});
test('regular browsers retain the existing blocked-popup recovery',async()=>{
  const h=harness(undefined,null);assert.equal(await h.client.startOAuth(),false);assert.equal(h.opened.length,1);assert.equal(h.timers.length,0);
});
test('regular browser popup accepts the exact worker origin and forwards authCode to activation',async()=>{
  const h=harness();const activated=[];h.client.activateWithCode=async code=>activated.push(code);
  const pending=h.client.startOAuth();await new Promise(resolve=>setImmediate(resolve));
  const handler=h.events.get('message');assert.ok(handler);
  await handler({origin:'https://evil.example',data:{type:'vnd-auth-code',authCode:'wrong'}});assert.deepEqual(activated,[]);
  await handler({origin:'https://vnd-license.gmredvelvet.workers.dev',data:{type:'vnd-auth-code',authCode:'fixture-code'}});
  assert.equal(await pending,true);assert.deepEqual(activated,['fixture-code']);assert.equal(h.events.has('message'),false);
});
