import {socket,$,api,escapeHtml,fmtPct} from "/common.js";
let data;
let hostPin=sessionStorage.getItem("beerfactory:hostPin")||"";

async function hostApi(url,options={}){
  return api(url,{...options,headers:{...(options.headers||{}),"x-host-pin":hostPin}});
}
async function auth(pin){
  await api("/api/host/auth",{method:"POST",body:JSON.stringify({pin})});
  hostPin=pin;sessionStorage.setItem("beerfactory:hostPin",pin);showApp();await load();
}
function showApp(){$("#lock").classList.add("hidden");$("#hostApp").classList.remove("hidden")}
function showLock(){$("#lock").classList.remove("hidden");$("#hostApp").classList.add("hidden")}
async function load(){
  try{data=await hostApi("/api/host-state");render()}
  catch(e){if(e.message.includes("PIN")){sessionStorage.removeItem("beerfactory:hostPin");hostPin="";showLock()}else msg(e.message,true)}
}
function msg(text,bad=false){const el=$("#message");el.textContent=text;el.classList.remove("hidden");el.classList.toggle("bad",bad);setTimeout(()=>el.classList.add("hidden"),2600)}
function render(){
  $("#teamCount").textContent=`${data.teams.length} команд · ${data.teams.reduce((n,t)=>n+t.players.length,0)} игроков`;
  $("#teams").innerHTML=data.teams.length?data.teams.map(t=>`<div class="team"><div><div class="row"><input class="input team-name" data-id="${t.id}" value="${escapeHtml(t.name)}"><button class="btn save-team" data-id="${t.id}">Сохранить</button></div><div class="row small muted" style="margin-top:8px"><span>Код: <b>${t.joinCode}</b></span><span>${t.players.length} игроков</span><a class="btn" href="/join/${t.joinCode}" target="_blank">Открыть</a></div>${t.players.length?`<div class="small muted" style="margin-top:8px">${t.players.map(p=>escapeHtml(p.name)).join(" · ")}</div>`:""}</div><div class="row"><img class="qr" alt="QR команды ${escapeHtml(t.name)}" src="/api/teams/${t.id}/qr.svg"><button class="btn danger del-team" data-id="${t.id}">Удалить</button></div></div>`).join(""):`<p class="muted">Добавьте первую команду. Их количество не ограничено.</p>`;
  $("#questionSelect").innerHTML=data.questions.map(q=>`<option value="${q.id}" ${data.round.questionId===q.id?"selected":""}>${escapeHtml(q.text)}</option>`).join("");
  const r=data.round;
  $("#roundInfo").innerHTML=r.status==="idle"?`<div class="notice">Экран в режиме ожидания.</div>`:`<div class="notice"><b>${escapeHtml(r.question?.text||"")}</b><br>${r.status==="open"?"Идёт приём ответов":r.status==="closed"?"Ответы закрыты":"Ответ показан"} · участников: ${r.eligiblePlayerIds?.length||0}${r.results?.length?`<br><br>${r.results.map(x=>`${x.winner?"★ ":""}${escapeHtml(x.teamName)} — ${fmtPct(x.accuracy)} (${x.correct}/${x.eligible})${x.winner?" · +1":""}`).join("<br>")}`:""}</div>`;
  $("#startBtn").disabled=r.status==="open";
  $("#closeBtn").disabled=r.status!=="open";
  $("#revealBtn").disabled=!["closed","revealed"].includes(r.status);
  $("#standings").innerHTML=data.standings.length?data.standings.map(x=>`<div class="leader"><div class="rank">#${x.rank}</div><div><b>${escapeHtml(x.name)}</b><div class="small muted">${x.players} игроков</div></div><div class="score">${x.score}</div></div>`).join(""):`<p class="muted">Пока нет команд.</p>`;
}
$("#pinForm").addEventListener("submit",async e=>{e.preventDefault();$("#pinError").textContent="";try{await auth($("#pin").value.trim())}catch(err){$("#pinError").textContent=err.message}});
$("#logout").addEventListener("click",()=>{sessionStorage.removeItem("beerfactory:hostPin");hostPin="";showLock()});
$("#addTeam").addEventListener("submit",async e=>{e.preventDefault();try{await hostApi("/api/host/teams",{method:"POST",body:JSON.stringify({name:$("#teamName").value})});$("#teamName").value="";await load()}catch(e){msg(e.message,true)}});
$("#teams").addEventListener("click",async e=>{const id=e.target.dataset.id;if(!id)return;try{if(e.target.classList.contains("save-team")){const input=document.querySelector(`.team-name[data-id="${id}"]`);await hostApi("/api/host/teams/"+id,{method:"PATCH",body:JSON.stringify({name:input.value})})}if(e.target.classList.contains("del-team")){if(!confirm("Удалить команду и её игроков?"))return;await hostApi("/api/host/teams/"+id,{method:"DELETE"})}await load()}catch(err){msg(err.message,true)}});
$("#startBtn").addEventListener("click",async()=>{try{await hostApi("/api/host/round/start",{method:"POST",body:JSON.stringify({questionId:$("#questionSelect").value})});await load()}catch(e){msg(e.message,true)}});
$("#closeBtn").addEventListener("click",async()=>{try{await hostApi("/api/host/round/close",{method:"POST"});await load()}catch(e){msg(e.message,true)}});
$("#revealBtn").addEventListener("click",async()=>{try{await hostApi("/api/host/round/reveal",{method:"POST"});await load()}catch(e){msg(e.message,true)}});
$("#clearBtn").addEventListener("click",async()=>{try{await hostApi("/api/host/round/clear",{method:"POST"});await load()}catch(e){msg(e.message,true)}});
$("#resetScores").addEventListener("click",async()=>{if(!confirm("Сбросить все очки?"))return;try{await hostApi("/api/host/reset-scores",{method:"POST"});await load()}catch(e){msg(e.message,true)}});
socket.on("state:changed",()=>{if(hostPin)load()});
if(hostPin){showApp();load()}else showLock();
