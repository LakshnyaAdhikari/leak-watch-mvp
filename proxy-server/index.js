// index.js - LeakWatch Proxy + Dashboard Server (Option B)

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({ extended: true }));

let clipboardEvents = [];
let blockedDomains = new Set();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj){
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { if(c.readyState === 1) c.send(s); });
}

function smallHash(s){
  if(!s) return null;
  let h = 0; for(let i=0;i<s.length;i++){ h = ((h<<5)-h)+s.charCodeAt(i); h|=0; }
  return (h>>>0).toString(16);
}

app.post('/extension-event', (req,res)=>{
  const evt = req.body||{};
  evt.ts = Date.now();
  if(evt.snippet){
    evt.snippetHash = smallHash(evt.snippet);
    delete evt.snippet;
  }
  clipboardEvents.push(evt);
  clipboardEvents = clipboardEvents.filter(e => Date.now()-e.ts < 5000);
  broadcast({type:'extension-event', evt});
  res.json({ok:true});
});

app.post('/proxy-log', express.raw({type:'*/*',limit:'5mb'}), (req,res)=>{
  const host = req.headers.host || 'unknown';
  const body = (req.body||Buffer.alloc(0)).toString();
  const event = {host, bodyPreview: body.slice(0,200), ts: Date.now()};

  if(blockedDomains.has(host.split(':')[0])){
    broadcast({type:'blocked-attempt', event});
    return res.status(403).send("Blocked by LeakWatch");
  }

  let correlated = clipboardEvents.length>0;
  broadcast({type:'proxy-event', event, correlated});broadcast({ type: 'proxy-event', pEvent: event, correlated: correlated });

  res.json({ok:true});
});

app.post('/action', express.json(), (req,res)=>{
  const {action,domain}=req.body||{};
  if(action==="block-domain"&&domain){
    blockedDomains.add(domain);
    broadcast({type:'blocked-domain',domain});
    return res.json({ok:true});
  }
  res.json({ok:false});
});

app.use('/dashboard', express.static(path.join(__dirname,'../dashboard')));

app.get('/',(req,res)=>res.redirect('/dashboard/index.html'));

// 🧪 DEMO: rich, varied fake alerts (jittered timing, mixed confidence/hosts)
const demoHosts = [
  'api.writeassist.io',
  'grammarfixer.ai',
  'docsync.io',
  'spellcheckr.cloud',
  'clip-uploader.net',
  'nlp-helper.app',
  'autosave-kit.dev',
  'note-syncer.xyz',
  'context-harvest.io',
  'demo-leak.ai'
];

const demoPages = [
  'https://docs.google.com/document/123',
  'https://mail.google.com/mail/u/0/#inbox',
  'https://www.notion.so/workspace',
  'https://drive.google.com/file/some-id',
  'https://github.com/yourrepo/issues/42',
  'https://calendar.google.com/event?eid=abc',
  'https://web.whatsapp.com/',
];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// optionally seed a few blocked domains so blocked-attempt cards also show
const demoBlockedSeed = ['clip-uploader.net'];
demoBlockedSeed.forEach(d => blockedDomains.add(d));

function emitFakeAlert() {
  const host = pick(demoHosts);
  const page = pick(demoPages);

  // confidence spread 0.45–0.98 so you see Low/Med/High
  const confidence = Math.round(rand(45, 98)) / 100;

  const payload = {
    type: 'proxy-event',
    pEvent: {
      host,
      bodyPreview: 'demo: ' + (Math.random() < 0.5 ? 'base64:YWJj...' : 'text: "Quarterly results..."'),
      ts: Date.now(),
      page
    },
    correlated: true,                           // dashboard will treat as alert
    correlation: {                              // ✅ gives your UI a real score
      confidence,
      clipboard: { page }
    }
  };

  broadcast(payload);

  // ~20% chance also emit a blocked attempt from a pre-blocked domain
  if (Math.random() < 0.2) {
    const blockedHost = pick([...blockedDomains]);
    if (blockedHost) {
      broadcast({ type: 'blocked-attempt', event: { host: blockedHost, ts: Date.now() } });
    }
  }

  // schedule next one with jitter 5–12s (feels more “live” than fixed interval)
  const nextMs = Math.floor(rand(5000, 12000));
  setTimeout(emitFakeAlert, nextMs);
}

// kick it off
setTimeout(emitFakeAlert, 2000);


server.listen(8080,()=>console.log("LeakWatch running → http://127.0.0.1:8080/dashboard/index.html"));
