import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const PIN="2468";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const result=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return result;
}
async function waitReady(base,child){
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error("Game server exited before becoming ready");
    try{
      const response=await fetch(base+"/api/health");
      if(response.ok)return;
    }catch{}
    await sleep(100);
  }
  throw Error("Timed out waiting for server health endpoint");
}
test("anniversary quiz HTTP flow",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"beerfactory-quiz-test-"));
  const activePort=await port();
  const base="http://127.0.0.1:"+activePort;
  let child=null;
  let logs="";
  async function call(endpoint,method="GET",body,host=false){
    const headers={};
    if(host)headers["x-host-pin"]=PIN;
    if(body!==undefined)headers["content-type"]="application/json";
    const response=await fetch(base+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json().catch(()=>null);
    return {response,result};
  }
  try{
    await fs.copyFile(path.join(root,"data/questions.json"),path.join(dir,"questions.json"));
    child=spawn(process.execPath,["server.js"],{
      cwd:root,
      env:{...process.env,PORT:String(activePort),HOST_PIN:PIN,DATA_DIR:dir,PUBLIC_URL:base},
      stdio:["ignore","pipe","pipe"]
    });
    child.stdout.on("data",d=>logs+=d.toString());
    child.stderr.on("data",d=>logs+=d.toString());
    await waitReady(base,child);

    const unauthorized=await call("/api/host-state");
    assert.equal(unauthorized.response.status,401);
    const authorized=await call("/api/host-state","GET",undefined,true);
    assert.equal(authorized.response.status,200);
    assert.equal(authorized.result.questions.length,25);

    const a=await call("/api/host/teams","POST",{name:"Пивные гики"},true);
    const b=await call("/api/host/teams","POST",{name:"Хмельные мысли"},true);
    assert.equal(a.response.status,201);
    assert.equal(b.response.status,201);
    assert.notEqual(a.result.joinCode,b.result.joinCode);

    const guestA=await call("/api/join/"+a.result.joinCode,"POST",{name:"Алекс"});
    const guestB=await call("/api/join/"+b.result.joinCode,"POST",{name:"Ира"});
    assert.equal(guestA.response.status,200);
    assert.equal(guestB.response.status,200);

    const qid=authorized.result.questions[0].id;
    const started=await call("/api/host/round/start","POST",{questionId:qid},true);
    assert.equal(started.response.status,200);

    const before=await call("/api/public-state");
    assert.equal(before.result.round.status,"open");
    assert.equal(before.result.round.question.correctOption,undefined,"Do not leak the correct answer to guests");

    const answeredA=await call("/api/answer","POST",{playerId:guestA.result.player.id,option:3});
    const answeredB=await call("/api/answer","POST",{playerId:guestB.result.player.id,option:0});
    assert.equal(answeredA.response.status,200);
    assert.equal(answeredB.response.status,200);
    const duplicate=await call("/api/answer","POST",{playerId:guestA.result.player.id,option:3});
    assert.equal(duplicate.response.status,409);

    const close=await call("/api/host/round/close","POST",undefined,true);
    assert.equal(close.response.status,200);
    const beforeReveal=await call("/api/public-state");
    assert.deepEqual(beforeReveal.result.teams.map(t=>t.score),[0,0],"Scores stay hidden until result reveal");

    const reveal=await call("/api/host/round/reveal","POST",undefined,true);
    assert.equal(reveal.response.status,200);
    const afterReveal=await call("/api/public-state");
    assert.equal(afterReveal.result.round.status,"revealed");
    assert.equal(afterReveal.result.teams[0].name,"Пивные гики");
    assert.equal(afterReveal.result.teams[0].score,1);
    assert.equal(afterReveal.result.round.question.correctOption,3);

    await call("/api/host/round/reveal","POST",undefined,true);
    const noDouble=await call("/api/public-state");
    assert.equal(noDouble.result.teams[0].score,1,"Showing results twice must not grant extra points");

    const qr=await fetch(base+"/api/teams/"+a.result.id+"/qr.svg");
    assert.equal(qr.status,200);
    assert.match(await qr.text(),/<svg/);

    const final=await call("/api/host/final","POST",undefined,true);
    assert.equal(final.response.status,200);
    const finalView=await call("/api/public-state");
    assert.equal(finalView.result.round.status,"final");

    for(const route of ["/host","/screen","/join","/join/"+a.result.joinCode]){
      const response=await fetch(base+route);
      assert.equal(response.status,200);
      const html=await response.text();
      assert.match(html,/\/event\.css/);
      assert.match(html,/-v2\.js/);
    }
  }catch(err){
    throw new Error(err.message+"\nServer output:\n"+logs);
  }finally{
    if(child){child.kill("SIGTERM");await sleep(120)}
    await fs.rm(dir,{recursive:true,force:true});
  }
},{timeout:30000});
