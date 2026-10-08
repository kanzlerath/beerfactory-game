import {socket,$,api,escapeHtml,fmtPct,hideSplash} from "/common.js";

let data=null,hostPin=sessionStorage.getItem("beerfactory:hostPin")||"";
let pending=false,again=false,teamSignature="",scoreSignature="",selectedQuestion="";
const logo='<div class="row" style="gap:13px"><img src="/assets/beerfactory-mark.svg" alt="BeerFactory" width="45" height="62" style="object-fit:contain"><div><div class="wordmark-main">ПУЛЬТ ВЕДУЩЕГО</div><div class="wordmark-sub" style="margin-top:5px;color:var(--bf-orange)">BEERFACTORY · 12 ЛЕТ</div></div></div>';
$("#lockLogo").innerHTML=logo;
$("#hostLogo").innerHTML=logo;
function showApp(){$("#lock").classList.add("hidden");$("#hostApp").classList.remove("hidden");hideSplash()}
function showLock(){$("#lock").classList.remove("hidden");$("#hostApp").classList.add("hidden");hideSplash()}
async function hostApi(url,options={}){
  return api(url,{...options,headers:{...(options.headers||{}),"x-host-pin":hostPin}});
}
function msg(message,bad=false){
  const el=$("#message");el.textContent=message;el.classList.remove("hidden");el.classList.toggle("bad",bad);
}
async function auth(pin){
  await api("/api/host/auth",{method:"POST",body:JSON.stringify({pin})});
  hostPin=pin;sessionStorage.setItem("beerfactory:hostPin",hostPin);showApp();await load();
}
async function load(){
  if(!hostPin)return;
  if(pending){again=true;return}
  pending=true;
  try{data=await hostApi("/api/host-state");render();hideSplash()}
  catch(e){
    if(e.message.includes("PIN")){hostPin="";sessionStorage.removeItem("beerfactory:hostPin");showLock()}
    else msg("Нет связи с сервером. "+e.message,true);
  }finally{
    pending=false;
    if(again){again=false;load()}
  }
}
function setMode(status){
  const label={idle:"В ЭФИРЕ: ОЖИДАНИЕ",open:"В ЭФИРЕ: ВОПРОС / ТАЙМЕР",closed:"В ЭФИРЕ: ВРЕМЯ ВЫШЛО",revealed:"В ЭФИРЕ: РЕЗУЛЬТАТ",final:"В ЭФИРЕ: ФИНАЛ"};
  $("#screenStateText").textContent=label[status]||"ОЖИДАНИЕ";
  document.querySelectorAll(".screen-tile").forEach(el=>{
    const target=el.dataset.screenAction;
    const active=target===(status==="idle"?"waiting":status==="revealed"?"result":status==="final"?"final":"question");
    el.classList.toggle("is-active",active);
    el.setAttribute("aria-pressed",String(active));
    el.disabled=target==="result"&&!["closed","revealed"].includes(status)||
      target==="final"&&status==="open"||
      target==="question"&&["open","closed"].includes(status);
  });
}
function formatQuestions(){
  const el=$("#questionSelect");
  const selected=selectedQuestion||data.round.questionId||data.questions[0]?.id;
  const groups=[...new Map(data.questions.map(q=>[q.round,q.roundTitle])).entries()];
  el.innerHTML=groups.map(([r,title])=>
    '<optgroup label="'+r+' · '+escapeHtml(title)+'">'+
    data.questions.filter(q=>q.round===r).map(q=>
      '<option value="'+q.id+'"'+(q.id===selected?' selected':'')+'>'+q.questionNumber+' · '+escapeHtml(q.text)+'</option>'
    ).join("")+'</optgroup>').join("");
  selectedQuestion=el.value;
}
function questionPreview(){
  if(!data)return;
  const q=data.questions.find(x=>x.id===selectedQuestion)||data.questions[0];
  if(!q){$("#questionPreview").innerHTML='<div class="notice">Добавьте вопросы в data/questions.json</div>';return}
  const answers=q.options.map((o,i)=>'<span><b>'+String.fromCharCode(65+i)+'</b> '+escapeHtml(o)+'</span>').join("");
  $("#questionPreview").innerHTML=
    '<div class="question-preview-label">РАУНД '+q.round+' · '+escapeHtml(q.roundTitle)+' · ВОПРОС '+q.questionNumber+'/5</div>'+
    '<div class="question-preview-title">'+escapeHtml(q.text)+'</div>'+
    '<div class="question-preview-options">'+answers+'</div>'+
    '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:11px;color:var(--bf-orange);font-size:12px">'+
    '<span>ОТВЕТ: '+String.fromCharCode(65+q.correctOption)+' · '+escapeHtml(q.options[q.correctOption])+'</span>'+
    '<span>'+q.durationSec+' СЕК. · '+(q.points||1)+' ОЧК.</span></div>';
}
function teamHtml(t){
  const players=(t.players||[]).map(p=>'<span class="host-player">'+escapeHtml(p.name)+
    '<button type="button" class="del-player" data-player-id="'+p.id+'" title="Удалить игрока">×</button></span>').join("");
  return '<div class="team" data-team="'+t.id+'"><div>'+
    '<div class="row"><input class="input team-name" aria-label="Название команды" data-id="'+t.id+'" value="'+escapeHtml(t.name)+'">'+
    '<button class="btn save-team" data-id="'+t.id+'">Сохранить</button></div>'+
    '<div class="host-team-meta"><span>Код '+t.joinCode+'</span><span>'+t.players.length+' участников</span>'+
    '<span class="host-progress" data-progress="'+t.id+'"></span>'+
    '<a href="/join/'+t.joinCode+'" target="_blank">Ссылка на вход ↗</a></div>'+
    '<div class="host-player-list">'+players+'</div></div>'+
    '<div class="row" style="justify-content:flex-end"><img class="qr" src="/api/teams/'+t.id+'/qr.svg" alt="QR-код команды">'+
    '<button class="btn danger del-team" data-id="'+t.id+'">Удалить</button></div></div>';
}
function renderTeams(){
  const signature=data.teams.map(t=>[t.id,t.name,t.players.map(p=>p.id+"="+p.name).join("/")].join("|")).join(";");
  $("#teamCount").textContent=data.teams.length+' команд · '+data.teams.reduce((n,t)=>n+t.players.length,0)+' игроков';
  if(signature!==teamSignature){
    const focused=document.activeElement;
    const editing=focused?.classList?.contains("team-name")?{id:focused.dataset.id,value:focused.value,selection:focused.selectionStart}:null;
    $("#teams").innerHTML=data.teams.length?data.teams.map(teamHtml).join(""):'<p class="muted">Создайте первую команду. Количество команд не ограничено.</p>';
    teamSignature=signature;
    if(editing){
      const el=document.querySelector('.team-name[data-id="'+editing.id+'"]');
      if(el){el.value=editing.value;el.focus();el.setSelectionRange(editing.selection,editing.selection)}
    }
  }
  for(const t of data.teams){
    const el=document.querySelector('[data-progress="'+t.id+'"]');
    if(el)el.textContent=data.round.status==="open"&&t.roundProgress?.eligible?
      t.roundProgress.answered+'/'+t.roundProgress.eligible+' ответили':"";
  }
}
function renderStandings(){
  const signature=data.standings.map(t=>t.id+":"+t.score+":"+t.name+":"+t.players).join("|");
  if(signature===scoreSignature)return;
  scoreSignature=signature;
  $("#standings").innerHTML=data.standings.length?data.standings.map((x,i)=>
    '<div class="leader"><span class="rank">'+String(i+1).padStart(2,"0")+'</span>'+
    '<div><b>'+escapeHtml(x.name)+'</b><div class="small muted">'+x.players+' игроков</div></div>'+
    '<div class="score-controls"><button class="btn score-change" data-id="'+x.id+'" data-delta="-1" aria-label="Минус очко">−</button>'+
    '<div class="score">'+x.score+'</div><button class="btn score-change" data-id="'+x.id+'" data-delta="1" aria-label="Плюс очко">+</button></div></div>'
  ).join(""):'<div class="muted">Пока нет команд.</div>';
}
function nextQuestionId(){
  const index=data.questions.findIndex(q=>q.id===data.round.questionId);
  if(index===data.questions.length-1)return null;
  return data.questions[index+1]?.id||data.questions[0]?.id;
}
function renderControls(){
  const r=data.round,s=r.status,q=data.questions.find(x=>x.id===r.questionId);
  setMode(s);
  const action=s==="idle"?"start":s==="open"?"close":s==="closed"?"reveal":s==="revealed"?"next":"waiting";
  const title={start:"ЗАПУСТИТЬ ВОПРОС →",close:"ЗАВЕРШИТЬ ВОПРОС",reveal:"ПОКАЗАТЬ РЕЗУЛЬТАТ →",next:nextQuestionId()?"СЛЕДУЮЩИЙ ВОПРОС →":"ПОКАЗАТЬ ФИНАЛ →",waiting:"К ВОПРОСАМ →"};
  $("#mainActionBtn").dataset.action=action;$("#mainActionBtn").textContent=title[action];$("#mainActionBtn").disabled=action==="start"&&!data.questions.length;
  $("#nextBtn").classList.add("hidden");
  $("#clearBtn").textContent="ВЕРНУТЬ ЭКРАН ОЖИДАНИЯ";
  if(s==="idle")$("#roundInfo").innerHTML='<div class="notice">Выберите вопрос и нажмите большую оранжевую кнопку. На экране зала сразу пойдёт отсчёт.</div>';
  else if(s==="open"){
    const replied=data.teams.reduce((n,t)=>n+(t.roundProgress?.answered||0),0);
    $("#roundInfo").innerHTML='<div class="notice"><b>СЕЙЧАС НА ЭКРАНЕ:</b> '+escapeHtml(q?.text||'')+
      '<div style="font-size:26px;margin-top:8px;color:var(--bf-orange);font-weight:800">'+replied+' / '+r.eligiblePlayerIds.length+
      '</div><span class="muted">ответили</span></div>';
  }else if(s==="closed")$("#roundInfo").innerHTML='<div class="notice"><b>ВРЕМЯ ВЫШЛО.</b> Ответы закрыты, очки подсчитаны. Теперь покажите результат.</div>';
  else if(s==="revealed")$("#roundInfo").innerHTML='<div class="notice"><b>РЕЗУЛЬТАТ ПОКАЗАН.</b> '+
    (r.results||[]).filter(x=>x.winner).map(x=>escapeHtml(x.teamName)+' +'+(x.awardedPoints||1)).join(" · ")+
    '<div style="margin-top:6px">Следующий шаг — '+(nextQuestionId()?'новый вопрос.':'финальный экран.')+'</div></div>';
  else $("#roundInfo").innerHTML='<div class="notice">На большом экране — победители и итоговый рейтинг. Можно вернуться к вопросам или показать QR.</div>';
  const previewQuestion=s==="idle"?data.questions.find(q=>q.id===selectedQuestion):q;
  const tileQuestion=document.querySelector('.screen-tile[data-screen-action="question"] .mini-title');
  if(tileQuestion)tileQuestion.textContent=(previewQuestion?.text||"Текст вопроса").slice(0,62);
  const tileResult=document.querySelector('.screen-tile[data-screen-action="result"] .mini-title');
  if(tileResult)tileResult.textContent=q?.options?.[q.correctOption]||"Результат раунда";
}
function render(){
  if(!data)return;
  if(!$("#questionSelect").options.length)formatQuestions();
  renderTeams();renderStandings();questionPreview();renderControls();
}
async function post(path,body){
  const payload=body?{method:"POST",body:JSON.stringify(body)}:{method:"POST"};
  await hostApi(path,payload);await load();
}
async function start(id){await post("/api/host/round/start",{questionId:id})}
async function final(){await post("/api/host/final")}
async function action(name){
  if(!data)return;
  const s=data.round.status;
  if(name==="waiting"){
    if(s==="open"&&!confirm("Прервать вопрос и перейти к экрану ожидания? Ответы этого вопроса не будут засчитаны."))return;
    return post("/api/host/round/clear");
  }
  if(name==="question"){
    if(s==="open"||s==="closed")return;
    return start(selectedQuestion);
  }
  if(name==="result"){
    if(s==="closed")return post("/api/host/round/reveal");
    return;
  }
  if(name==="final"){
    if(s==="open")return;
    return final();
  }
  if(name==="start")return start(selectedQuestion);
  if(name==="close"){
    if(!confirm("Закрыть приём ответов досрочно?"))return;
    return post("/api/host/round/close");
  }
  if(name==="reveal")return post("/api/host/round/reveal");
  if(name==="next"){
    const next=nextQuestionId();
    if(!next)return final();
    selectedQuestion=next;$("#questionSelect").value=next;questionPreview();return start(next);
  }
}
async function safeAction(name){
  try{await action(name)}catch(e){msg(e.message,true)}
}
$("#pinForm").addEventListener("submit",async e=>{
  e.preventDefault();$("#pinError").textContent="";
  try{await auth($("#pin").value.trim())}catch(err){$("#pinError").textContent=err.message}
});
$("#logout").addEventListener("click",()=>{sessionStorage.removeItem("beerfactory:hostPin");hostPin="";showLock()});
$("#questionSelect").addEventListener("change",()=>{selectedQuestion=$("#questionSelect").value;questionPreview()});
$("#mainActionBtn").addEventListener("click",e=>safeAction(e.currentTarget.dataset.action));
$("#clearBtn").addEventListener("click",()=>safeAction("waiting"));
$("#screenTiles").addEventListener("click",e=>{
  const tile=e.target.closest(".screen-tile");if(tile&&!tile.disabled)safeAction(tile.dataset.screenAction);
});
$("#addTeam").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await post("/api/host/teams",{name:$("#teamName").value});$("#teamName").value=""}catch(err){msg(err.message,true)}
});
$("#teams").addEventListener("click",async e=>{
  const p=e.target.closest(".del-player");
  if(p){if(!confirm("Удалить участника?"))return;try{await hostApi("/api/host/players/"+p.dataset.playerId,{method:"DELETE"});await load()}catch(err){msg(err.message,true)}return}
  const b=e.target.closest("[data-id]");if(!b)return;
  try{
    if(b.classList.contains("save-team"))await hostApi("/api/host/teams/"+b.dataset.id,{method:"PATCH",body:JSON.stringify({name:document.querySelector('.team-name[data-id="'+b.dataset.id+'"]').value})});
    else if(b.classList.contains("del-team")){
      if(!confirm("Удалить команду со всеми игроками?"))return;
      await hostApi("/api/host/teams/"+b.dataset.id,{method:"DELETE"});
    }else return;
    await load();
  }catch(err){msg(err.message,true)}
});
$("#standings").addEventListener("click",async e=>{
  const b=e.target.closest(".score-change");if(!b)return;
  try{await post("/api/host/teams/"+b.dataset.id+"/score",{delta:Number(b.dataset.delta)})}catch(err){msg(err.message,true)}
});
$("#resetScores").addEventListener("click",async()=>{
  if(!confirm("Сбросить все очки?"))return;
  try{await post("/api/host/reset-scores")}catch(e){msg(e.message,true)}
});
socket.on("state:changed",load);
socket.on("connect",load);
socket.on("disconnect",()=>msg("Связь с сервером прервана — ожидаем подключения",true));
if(hostPin){showApp();load()}else showLock();
