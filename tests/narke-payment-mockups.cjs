/* Isolated visual checks: public sandbox routes only, no accounts or API calls. */
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs");

async function main() {
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  assert(process.env.REPLIT_DEV_DOMAIN);
  const profile = fs.mkdtempSync("/tmp/narke-payment-mockup-");
  const chrome = spawn("chromium", ["--headless","--no-sandbox","--disable-dev-shm-usage",
    "--remote-debugging-port=9248",`--user-data-dir=${profile}`,"about:blank"], {stdio:"ignore"});
  let socket;
  try {
    let tab;
    for (let i=0; i<60 && !tab; i++) {
      try {tab=(await (await fetch("http://127.0.0.1:9248/json/list")).json()).find(t=>t.type==="page");}
      catch {}
      if (!tab) await new Promise(r=>setTimeout(r,100));
    }
    assert(tab, "Chromium did not open");
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const pending = new Map();
    const exceptions = [], apiCalls = [];
    let sequence=0, activeContext, activeSession;
    const frameContexts=new Map();
    function call(method,params={},sessionId) {
      return new Promise((resolve,reject)=>{
        const id=++sequence;
        const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(method+" timed out"));},15000);
        pending.set(id,{resolve,reject,timeout});
        socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
      });
    }
    socket.onmessage = event=>{
      const m=JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timeout);
        m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);
      }
      if (m.method==="Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text);
      // Some extracted designs intentionally isolate their original CSS in srcdoc.
      if(m.method==="Target.attachedToTarget" && m.params.targetInfo.type==="iframe") {
        activeSession=m.params.sessionId;
        call("Runtime.enable",{},activeSession).catch(()=>{});
      }
      if(m.method==="Target.detachedFromTarget" && m.params.sessionId===activeSession) activeSession=undefined;
      if (m.method==="Runtime.executionContextCreated" && m.params.context.auxData?.isDefault) {
        if(m.sessionId) frameContexts.set(m.sessionId,m.params.context.id);
        else activeContext=m.params.context.id;
      }
      if (m.method==="Runtime.executionContextsCleared" ||
          (m.method==="Runtime.executionContextDestroyed" && m.params.executionContextId===activeContext)) activeContext=undefined;
      if (m.method==="Fetch.requestPaused") {
        apiCalls.push(m.params.request.url);
        call("Fetch.failRequest",{requestId:m.params.requestId,errorReason:"BlockedByClient"}).catch(()=>{});
      }
    };
    async function evaluate(expression) {
      for(let attempt=0;attempt<4;attempt++) {
        const context=activeSession?frameContexts.get(activeSession):activeContext;
        try {
          const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,
            ...(context ? {contextId:context} : {})},activeSession);
          assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));
          return r.result.value;
        } catch(error) {
          if(!/Cannot find context|context was destroyed/i.test(error.message)||attempt===3) throw error;
          if(activeContext===context) activeContext=undefined;
          await new Promise(r=>setTimeout(r,100));
        }
      }
    }
    await call("Page.enable");await call("Runtime.enable");
    await call("Target.setAutoAttach",{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
    await call("Fetch.enable",{patterns:[{urlPattern:"*/api/*",requestStage:"Request"}]});
    const directions=process.argv.includes("--immersive-only")?["immersive"]:["ocean","clear","immersive"];
    for (const direction of directions) {
      for (const state of ["Payment","Pending","Success","Failure"]) {
        const path=`/__mockup/preview/payment-${direction}/${state}`;
        console.log("Checking",path);
        await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
        await call("Page.navigate",{url:base+path});
        let ready=false;
        for (let i=0;i<100;i++) {
          ready=await evaluate("document.readyState==='complete' && document.body.innerText.trim().length>60 && !document.querySelector('vite-error-overlay')");
          if(ready) break;
          await new Promise(r=>setTimeout(r,100));
        }
        assert(ready,`Preview not ready: ${path}`);
        await evaluate("document.fonts.ready.then(()=>Promise.all(Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))");
        for (const width of [320,390,472]) {
          await call("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:false});
          await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
          const stats=await evaluate(`({
            text:document.body.innerText,
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            broken:Array.from(document.images).filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src),
            smallInputs:Array.from(document.querySelectorAll('input')).filter(i=>i.getBoundingClientRect().width&&parseFloat(getComputedStyle(i).fontSize)<16).map(i=>i.placeholder)
          })`);
          assert(!stats.overflow,`${path} overflows at ${width}`);
          assert.deepEqual(stats.broken,[],`${path} broken images`);
          assert.deepEqual(stats.smallInputs,[],`${path} inputs trigger mobile zoom`);
          assert(!/IVECO|SonaraPay/i.test(stats.text),`${path} legacy/provider branding`);
          assert(/maquette|démonstration|ficti/i.test(stats.text),`${path} not marked as mockup`);
          if(width===390) {
            await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{})))");
            const shot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
            fs.writeFileSync(`/tmp/narke-payment-${direction}-${state}.png`,Buffer.from(shot.data,"base64"));
          }
        }
        if(state==="Payment") {
          await evaluate(`(() => {
            const moov=Array.from(document.querySelectorAll('button,label')).find(e=>/Moov/i.test(e.innerText));
            if(moov) moov.click();
            const phone=document.querySelector('input[type="tel"]');
            if(!phone) throw new Error('Missing phone input');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(phone,'70000000');
            phone.dispatchEvent(new Event('input',{bubbles:true}));
            phone.dispatchEvent(new Event('change',{bubbles:true}));
          })()`);
          await evaluate("new Promise(r=>requestAnimationFrame(r))");
          await evaluate("document.querySelector('form').requestSubmit()");
          let advanced=false;
          for(let i=0;i<60;i++) {
            await new Promise(r=>setTimeout(r,100));
            try {advanced=await evaluate("/attente|en cours/i.test(document.body.innerText) && !document.querySelector('input[type=tel]')");}
            catch {}
            if(!advanced) {
              // An isolated srcdoc preview can navigate its child frame rather
              // than the root. Its destination is verified independently below.
              const {frameTree}=await call("Page.getFrameTree");
              const reached=node=>node.frame.url.includes(`/payment-${direction}/Pending`)||
                (node.childFrames||[]).some(reached);
              advanced=reached(frameTree);
            }
            if(advanced) break;
          }
          assert(advanced,`${path} did not advance safely to pending`);
        }
      }
    }
    assert.deepEqual(apiCalls,[],"Mockups attempted production API requests");
    assert.deepEqual(exceptions,[],"Browser exceptions");
    console.log(`PASS: ${directions.length*4} payment mockups at320/390/472, loaded images, readable inputs, no legacy branding, demo labels, operator/phone submission to pending, no API calls or browser exceptions.`);
  } finally {
    if(socket) socket.close();
    chrome.kill("SIGTERM");
    await new Promise(r=>setTimeout(r,150));
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
