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
  broadcast({type:'proxy-event', event, correlated});
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

server.listen(8080,()=>console.log("LeakWatch running → http://127.0.0.1:8080/dashboard/index.html"));
