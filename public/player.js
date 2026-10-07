import {socket,$,api,escapeHtml,wordmark,hideSplash,setBusy} from "/common.js";
const code=location.pathname.split("/").filter(Boolean).pop().toUpperCase();
const storageKey="beerfactory:"+code+":player";
let playerId=localStorage.getItem(storageKey)||"";
let current=null,timer=null;
$("#logo").innerHTML=wordmark("PLAYER");
$("#teamBadge").textContent="Команда "+code;
hideSplash();

async function join(name){
  const data=await api("/api/join/"+code,{method:"POST",body:JSON.stringify({name,playerId})});
  playerId=data.player.id;localStorage.setItem(storageKey,playerId);$("#teamBadge").textContent=data.team.name;await load();
}
async function load(){
  if(!playerId)return;
  try{current=await api("/api/player-state/"+playerId);render();hideSplash()}
  catch{localStorage.removeItem(storageKey);playerId="";$("#joinCard").classList.remove("hidden");$("#game").classList.add("hidden");hideSplash()}
}
function render(){
  clearInterval(timer);
  $("#joinCard").classList.add("hidden");$("#game").classList.remove("hidden");$("#teamBadge").textContent=current.team?.name||"";
  const r=current.round,q=r.question;
  if(!q){$("#game").innerHTML=`<div class="card display-card player-state fade-in"><div class="eyebrow">${escapeHtml(current.team?.name||"Команда")}</div><div class="kicker" style="margin-top:8px">Вы в игре</div><h1 style="font-size:48px;margin:10px 0 12px">${escapeHtml(current.player.name)}</h1><p class="muted" style="margin-bottom:0">Оставайтесь на этой странице. Следующий вопрос появится автоматически.</p><span class="loading-dots" aria-label="Ожидание"><i></i><i></i><i></i></span></div>`;return}
  if(!r.eligible){$("#game").innerHTML=`<div class="card player-state fade-in"><div class="eyebrow">Раунд уже идёт</div><h2 style="font-size:32px;margin:10px 0">Вы с нами со следующего вопроса</h2><p class="muted">Ничего делать не нужно — экран обновится сам.</p><span class="loading-dots"><i></i><i></i><i></i></span></div>`;return}
  if(r.status==="open"){
    $("#game").innerHTML=`<div class="card fade-in"><div class="row spread"><div class="eyebrow">Вопрос</div><div id="mobileTimer" class="score"></div></div><div class="player-question">${escapeHtml(q.text)}</div><div class="grid">${q.options.map((o,i)=>`<button class="option answer ${r.answer?.option===i?"selected":""}" data-option="${i}" ${r.answer?"disabled":""}><span class="answer-badge">${String.fromCharCode(65+i)}</span>${escapeHtml(o)}</button>`).join("")}</div><div class="notice" style="margin-top:14px">${r.answer?"Ответ принят. Теперь смотрим на общий экран.":"Выберите один вариант. После отправки изменить ответ нельзя."}</div></div>`;
    const tick=()=>{const el=$("#mobileTimer");if(el)el.textContent=Math.max(0,Math.ceil((r.endsAt-Date.now())/1000))};tick();timer=setInterval(tick,200);return
  }
  if(r.status==="closed"){$("#game").innerHTML=`<div class="card display-card player-state fade-in"><div class="big-number">0</div><h2 style="font-size:34px;margin:22px 0 8px">Время вышло</h2><p class="muted">Ответ зафиксирован. Результаты сейчас появятся на большом экране.</p></div>`;return}
  if(r.status==="revealed"){
    const correct=r.answer?.option===q.correctOption;
    $("#game").innerHTML=`<div class="card player-state fade-in ${correct?"winner":""}"><div class="eyebrow">Правильный ответ</div><div class="screen-answer" style="font-size:44px;margin:12px 0 20px">${escapeHtml(q.options[q.correctOption])}</div><h2 style="margin-bottom:8px">${r.answer?(correct?"Точно. Засчитано.":"Не в этот раз."):"Ответ не отправлен."}</h2><p class="${correct?"ok":"muted"}" style="margin-bottom:0">${correct?"Ждём следующий вопрос.":"Следующий вопрос — новая попытка."}</p></div>`;
  }
}
$("#joinForm").addEventListener("submit",async e=>{e.preventDefault();$("#joinError").textContent="";const btn=$("#joinBtn");try{setBusy(btn,true,"Подключаем…");await join($("#name").value.trim())}catch(err){$("#joinError").textContent=err.message}finally{setBusy(btn,false)}});
$("#game").addEventListener("click",async e=>{const btn=e.target.closest(".answer");if(!btn||btn.disabled)return;try{document.querySelectorAll(".answer").forEach(x=>x.disabled=true);btn.classList.add("selected");await api("/api/answer",{method:"POST",body:JSON.stringify({playerId,option:Number(btn.dataset.option)})});await load()}catch(err){alert(err.message);await load()}});
socket.on("state:changed",load);
if(playerId)load();
