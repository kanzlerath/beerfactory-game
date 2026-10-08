import {socket,$,api,escapeHtml,fmtPct,wordmark,hideSplash} from "/common.js";
let data;
let hostPin=sessionStorage.getItem("beerfactory:hostPin")||"";
$("#lockLogo").innerHTML=wordmark("CONTROL");
$("#hostLogo").innerHTML=wordmark("CONTROL");

async function hostApi(url,options={}) {
  return api(url,{...options,headers:{...(options.headers||{}),"x-host-pin":hostPin}});
}
async function auth(pin){
  await api("/api/host/auth",{method:"POST",body:JSON.stringify({pin})});
  hostPin=pin;sessionStorage.setItem("beerfactory:hostPin",pin);showApp();await load();
}
function showApp(){$("#lock").classList.add("hidden");$("#hostApp").classList.remove("hidden");hideSplash()}
function showLock(){$("#lock").classList.remove("hidden");$("#hostApp").classList.add("hidden");hideSplash()}
async function load(){
  try{data=await hostApi("/api/host-state");render()}
  catch(e){if(e.message.includes("PIN")){sessionStorage.removeItem("beerfactory:hostPin");hostPin="";showLock()}else msg(e.message,true)}
}
function msg(text,bad=false){
  const el=$("#message");el.textContent=text;el.classList.remove("hidden");el.classList.toggle("bad",bad);
  setTimeout(()=>el.classList.add("hidden"),2800);
}
function playerList(team){
  if(!team.players.length)return "";
  return `<div class="host-player-list">${team.players.map(p=>`<span class="host-player">${escapeHtml(p.name)}<button class="del-player" data-player-id="${p.id}" title="Удалить игрока">×</button></span>`).join("")}</div>`;
}
function stateLabel(r){
  if(r.status==="idle") return "На экране: ожидание";
  if(r.status==="open") return "На экране: вопрос · идёт таймер";
  if(r.status==="closed") return "На экране: вопрос · время вышло";
  return "На экране: результат";
}
function mainAction(r){
  if(r.status==="idle"||r.status==="revealed") return {text:"Запустить вопрос",action:"start",disabled:false};
  if(r.status==="open") return {text:"Завершить вопрос сейчас",action:"close",disabled:false};
  if(r.status==="closed") return {text:"Показать результат",action:"reveal",disabled:false};
  return {text:"Запустить вопрос",action:"start",disabled:false};
}
function setTileState(r){
  document.querySelectorAll(".screen-tile").forEach(x=>x.classList.remove("is-active","is-disabled"));
  const key=r.status==="idle"?"waiting":r.status==="revealed"?"result":"question";
  document.querySelector(`.screen-tile[data-screen-action="${key}"]`)?.classList.add("is-active");
  const result=document.querySelector('.screen-tile[data-screen-action="result"]');
  if(result) result.classList.toggle("is-disabled",!["closed","revealed"].includes(r.status));
}
function renderQuestionPreview(){
  const q=data.questions.find(x=>x.id===$("#questionSelect").value)||data.questions[0];
  if(!q){$("#questionPreview").innerHTML='<div class="notice">Нет вопросов.</div>';return}
  $("#questionPreview").innerHTML=`<div class="question-preview-label">Предпросмотр</div><div class="question-preview-title">${escapeHtml(q.text)}</div><div class="question-preview-options">${q.options.map((o,i)=>`<span><b>${String.fromCharCode(65+i)}</b> ${escapeHtml(o)}</span>`).join("")}</div><div class="question-preview-time">${q.durationSec} сек.</div>`;
}
function render(){
  const r=data.round;
  $("#screenStateText").textContent=stateLabel(r);
  setTileState(r);

  $("#teamCount").textContent=`${data.teams.length} команд · ${data.teams.reduce((n,t)=>n+t.players.length,0)} участников`;
  $("#teams").innerHTML=data.teams.length?data.teams.map(t=>{
    const progress=r.status==="open"&&t.roundProgress?.eligible?`<span class="host-progress">${t.roundProgress.answered}/${t.roundProgress.eligible} ответили</span>`:"";
    return `<div class="team"><div><div class="row"><input class="input team-name" data-id="${t.id}" value="${escapeHtml(t.name)}"><button class="btn save-team" data-id="${t.id}">Сохранить</button></div><div class="host-team-meta"><span>Код <b>${t.joinCode}</b></span><span>${t.players.length} участников</span>${progress}<a href="/join/${t.joinCode}" target="_blank">Открыть вход</a></div>${playerList(t)}</div><div class="row"><img class="qr" alt="QR команды ${escapeHtml(t.name)}" src="/api/teams/${t.id}/qr.svg"><button class="btn danger del-team" data-id="${t.id}">Удалить</button></div></div>`;
  }).join(""):'<p class="muted">Добавьте первую команду.</p>';

  const selected=$("#questionSelect").value;
  $("#questionSelect").innerHTML=data.questions.map(q=>`<option value="${q.id}" ${selected===q.id||(!selected&&r.questionId===q.id)?"selected":""}>${escapeHtml(q.text)}</option>`).join("");
  if(!$("#questionSelect").value&&data.questions[0]) $("#questionSelect").value=data.questions[0].id;
  renderQuestionPreview();

  if(r.status==="idle"){
    $("#roundInfo").innerHTML='<div class="notice">Раунд не запущен. Подготовьте вопрос и нажмите «Запустить вопрос».</div>';
  }else if(r.status==="open"){
    const answered=data.teams.reduce((n,t)=>n+(t.roundProgress?.answered||0),0);
    $("#roundInfo").innerHTML=`<div class="notice"><b>Сейчас идёт вопрос.</b><br>${answered} из ${r.eligiblePlayerIds?.length||0} участников уже ответили.</div>`;
  }else if(r.status==="closed"){
    $("#roundInfo").innerHTML='<div class="notice"><b>Время вышло.</b><br>Ответы закрыты. Следующий шаг — показать результат на экране.</div>';
  }else{
    $("#roundInfo").innerHTML=`<div class="notice"><b>Результат показан.</b><br>${(r.results||[]).map(x=>`${x.winner?"★ ":""}${escapeHtml(x.teamName)} — ${fmtPct(x.accuracy)}`).join(" · ")||"Раунд завершён."}</div>`;
  }

  const action=mainAction(r);
  $("#mainActionBtn").textContent=action.text;
  $("#mainActionBtn").dataset.action=action.action;
  $("#mainActionBtn").disabled=action.disabled;
  $("#nextBtn").disabled=r.status==="open"||!data.questions.length;

  $("#standings").innerHTML=data.standings.length?data.standings.map(x=>`<div class="leader"><div class="rank">${String(x.rank).padStart(2,"0")}</div><div><b>${escapeHtml(x.name)}</b><div class="small muted">${x.players} участников</div></div><div class="score-controls"><button class="btn score-change" data-id="${x.id}" data-delta="-1">−</button><div class="score">${x.score}</div><button class="btn score-change" data-id="${x.id}" data-delta="1">+</button></div></div>`).join(""):'<p class="muted">Пока нет команд.</p>';
}
async function startQuestion(questionId){
  await hostApi("/api/host/round/start",{method:"POST",body:JSON.stringify({questionId})});
  await load();
}
function nextQuestionId(){
  if(!data.questions.length)return null;
  const current=$("#questionSelect").value||data.round.questionId;
  const idx=data.questions.findIndex(q=>q.id===current);
  return data.questions[(idx+1+data.questions.length)%data.questions.length].id;
}
async function doScreenAction(action){
  const r=data.round;
  if(action==="waiting"){await hostApi("/api/host/round/clear",{method:"POST"});return load()}
  if(action==="question"){
    if(r.status==="open"||r.status==="closed") return;
    return startQuestion($("#questionSelect").value);
  }
  if(action==="result"){
    if(r.status==="closed") {await hostApi("/api/host/round/reveal",{method:"POST"});return load()}
    if(r.status==="revealed") return;
    msg("Сначала завершите вопрос",true);
  }
}

$("#pinForm").addEventListener("submit",async e=>{e.preventDefault();$("#pinError").textContent="";try{await auth($("#pin").value.trim())}catch(err){$("#pinError").textContent=err.message}});
$("#logout").addEventListener("click",()=>{sessionStorage.removeItem("beerfactory:hostPin");hostPin="";showLock()});
$("#questionSelect").addEventListener("change",renderQuestionPreview);

$("#screenTiles").addEventListener("click",async e=>{
  const tile=e.target.closest(".screen-tile");if(!tile||tile.classList.contains("is-disabled"))return;
  try{await doScreenAction(tile.dataset.screenAction)}catch(err){msg(err.message,true)}
});

$("#mainActionBtn").addEventListener("click",async()=>{
  const action=$("#mainActionBtn").dataset.action;
  try{
    if(action==="start") await startQuestion($("#questionSelect").value);
    if(action==="close"){await hostApi("/api/host/round/close",{method:"POST"});await load()}
    if(action==="reveal"){await hostApi("/api/host/round/reveal",{method:"POST"});await load()}
  }catch(e){msg(e.message,true)}
});
$("#nextBtn").addEventListener("click",async()=>{
  try{
    const id=nextQuestionId();if(!id)return;
    $("#questionSelect").value=id;renderQuestionPreview();
    if(data.round.status==="revealed"||data.round.status==="idle") await startQuestion(id);
  }catch(e){msg(e.message,true)}
});
$("#clearBtn").addEventListener("click",async()=>{try{await doScreenAction("waiting")}catch(e){msg(e.message,true)}});

$("#addTeam").addEventListener("submit",async e=>{e.preventDefault();try{await hostApi("/api/host/teams",{method:"POST",body:JSON.stringify({name:$("#teamName").value})});$("#teamName").value="";await load()}catch(e){msg(e.message,true)}});
$("#teams").addEventListener("click",async e=>{
  const playerBtn=e.target.closest(".del-player");
  if(playerBtn){if(!confirm("Удалить игрока?"))return;try{await hostApi("/api/host/players/"+playerBtn.dataset.playerId,{method:"DELETE"});await load()}catch(err){msg(err.message,true)}return}
  const btn=e.target.closest("[data-id]");const id=btn?.dataset.id;if(!id)return;
  try{
    if(btn.classList.contains("save-team")){const input=document.querySelector(`.team-name[data-id="${id}"]`);await hostApi("/api/host/teams/"+id,{method:"PATCH",body:JSON.stringify({name:input.value})})}
    if(btn.classList.contains("del-team")){if(!confirm("Удалить команду и её игроков?"))return;await hostApi("/api/host/teams/"+id,{method:"DELETE"})}
    await load();
  }catch(err){msg(err.message,true)}
});
$("#standings").addEventListener("click",async e=>{const btn=e.target.closest(".score-change");if(!btn)return;try{await hostApi("/api/host/teams/"+btn.dataset.id+"/score",{method:"POST",body:JSON.stringify({delta:Number(btn.dataset.delta)})});await load()}catch(err){msg(err.message,true)}});
$("#resetScores").addEventListener("click",async()=>{if(!confirm("Сбросить все очки?"))return;try{await hostApi("/api/host/reset-scores",{method:"POST"});await load()}catch(e){msg(e.message,true)}});

socket.on("state:changed",()=>{if(hostPin)load()});
if(hostPin){showApp();load()}else showLock();
