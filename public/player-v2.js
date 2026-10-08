import {socket,$,api,escapeHtml,hideSplash,setBusy} from "/common.js";

const code=location.pathname.split("/").filter(Boolean).pop().toUpperCase();
const key="beerfactory:"+code+":player";
let playerId=localStorage.getItem(key)||"",view=null,lastKey="",timer=null,busy=false,pending=false;
$("#logo").innerHTML='<div class="row" style="gap:10px"><img src="/assets/beerfactory-mark.svg" alt="BeerFactory" width="33" height="49" style="object-fit:contain"><div><div class="wordmark-main" style="font-size:19px">ПИВОФЭКТОРИ</div><div class="wordmark-sub" style="margin-top:4px">КВИЗ · 12 ЛЕТ</div></div></div>';
$("#teamBadge").textContent="КОМАНДА "+code;

function showJoin(){
  clearInterval(timer);lastKey="";
  $("#game").classList.add("hidden");
  $("#joinCard").classList.remove("hidden");
  hideSplash();
}
async function join(name){
  const d=await api("/api/join/"+code,{method:"POST",body:JSON.stringify({name,playerId})});
  playerId=d.player.id;localStorage.setItem(key,playerId);
  $("#teamBadge").textContent=d.team.name;
  await load();
}
function tick(round){
  const left=Math.max(0,round.endsAt-Date.now());
  const sec=Math.ceil(left/1000);
  const timerEl=$("#mobileTimer"),bar=$("#phoneBar");
  if(timerEl)timerEl.textContent=String(sec).padStart(2,"0");
  if(bar)bar.style.width=Math.min(100,left/Math.max(1,round.question.durationSec*1000)*100)+"%";
  if(!left)document.querySelectorAll(".answer").forEach(btn=>btn.disabled=true);
}
function waiting(name,team){
  return '<div class="player-state scene-fade">'+
    '<div class="eyebrow">ВАША КОМАНДА · '+escapeHtml(team?.name||"КОМАНДА")+'</div>'+
    '<h1 style="margin:24px 0 16px">'+escapeHtml(name)+',<br><span style="color:var(--bf-orange)">ВЫ В ИГРЕ.</span></h1>'+
    '<p class="muted" style="font-size:18px;line-height:1.5;max-width:490px">Ожидайте начала. Первый вопрос появится здесь автоматически.</p>'+
    '<div class="loading-line"></div></div>';
}
function late(){
  return '<div class="player-state scene-fade"><div class="eyebrow">ВОПРОС УЖЕ ИДЁТ</div>'+
    '<h1 style="margin:23px 0 18px">ВЫ С НАМИ<br><span style="color:var(--bf-orange)">СО СЛЕДУЮЩЕГО.</span></h1>'+
    '<p class="muted">Оставайтесь на этой странице — всё обновится автоматически.</p><div class="loading-line"></div></div>';
}
function question(r){
  const q=r.question;
  const meta='РАУНД '+q.round+' · '+escapeHtml(q.roundTitle||"КВИЗ")+' · '+q.questionNumber+'/5';
  const options=q.options.map((o,i)=>'<button type="button" class="option answer '+(r.answer?.option===i?'selected':'')+
    '" data-option="'+i+'" '+(r.answer?'disabled':'')+'><span class="answer-badge">'+String.fromCharCode(65+i)+'</span><span>'+escapeHtml(o)+'</span></button>').join("");
  const optionsOrAccept=r.answer?
    '<div class="status-accepted scene-fade"><div class="eyebrow">ВАШ ВЫБОР · '+String.fromCharCode(65+r.answer.option)+'</div>'+
    '<h2 style="margin:18px 0 12px">ОТВЕТ<br>ПРИНЯТ.</h2>'+
    '<p class="muted" style="font-size:17px">Смотрите на общий экран. Скоро узнаем результаты.</p></div>':
    '<div class="grid">'+options+'</div><p class="muted small" style="margin-top:18px">Выберите один вариант. Изменить ответ будет нельзя.</p>';
  return '<div class="scene-fade">'+
    '<div class="row spread" style="gap:10px"><div class="eyebrow">'+meta+'</div><div id="mobileTimer" class="score">--</div></div>'+
    '<div class="phone-progress"><i id="phoneBar"></i></div>'+
    (r.answer?'':'<div class="player-question">'+escapeHtml(q.text)+'</div>')+
    optionsOrAccept+'</div>';
}
function closed(r){
  return '<div class="player-state scene-fade"><div class="big-number">00</div>'+
    '<h2 style="font-size:47px;margin:25px 0 16px">ВРЕМЯ<br><span style="color:var(--bf-orange)">ВЫШЛО.</span></h2>'+
    '<p class="muted" style="font-size:17px">'+(r.answer?'Ваш ответ сохранён.':'Ваш ответ не поступил.')+' Ждём результат на большом экране.</p></div>';
}
function revealed(r){
  const q=r.question,hasAnswer=Boolean(r.answer),correct=hasAnswer&&r.answer.option===q.correctOption;
  return '<div class="player-state scene-fade"><div class="eyebrow">ПРАВИЛЬНЫЙ ОТВЕТ</div>'+
    '<div class="result-answer" style="margin:25px 0;color:var(--bf-orange)">'+escapeHtml(q.options[q.correctOption])+'</div>'+
    '<div class="player-result-rule"></div>'+
    '<h2 style="font-size:46px">'+(correct?'ПОПАДАНИЕ.':hasAnswer?'В СЛЕДУЮЩИЙ РАЗ.':'НЕ УСПЕЛИ.')+'</h2>'+
    '<p class="muted" style="font-size:17px">Следующий вопрос появится автоматически.</p></div>';
}
function final(team){
  return '<div class="player-state scene-fade">'+
    '<div class="eyebrow">ИГРА ЗАВЕРШЕНА</div>'+
    '<h1 style="margin:22px 0">СПАСИБО<br><span style="color:var(--bf-orange)">ЗА ИГРУ!</span></h1>'+
    '<p style="font-size:21px">'+escapeHtml(team?.name||"Ваша команда")+'</p>'+
    '<div class="big-number" style="font-size:86px">'+(team?.score||0)+'</div>'+
    '<p class="muted">Очков вашей команды · итоги на большом экране.</p></div>';
}
function render(){
  if(!view)return;
  const r=view.round,q=r.question;
  $("#teamBadge").textContent=view.team?.name||"КОМАНДА";
  const scene=[r.status,q?.id||"",r.startedAt||"",r.answer?.option??"-"].join("|");
  $("#joinCard").classList.add("hidden");
  $("#game").classList.remove("hidden");
  if(scene===lastKey)return;
  lastKey=scene;
  clearInterval(timer);timer=null;
  if(r.status==="final")$("#game").innerHTML=final(view.team);
  else if(!q)$("#game").innerHTML=waiting(view.player.name,view.team);
  else if(!r.eligible)$("#game").innerHTML=late();
  else if(r.status==="open"){
    $("#game").innerHTML=question(r);
    tick(r);
    timer=setInterval(()=>tick(r),150);
  }else if(r.status==="closed")$("#game").innerHTML=closed(r);
  else $("#game").innerHTML=revealed(r);
}
async function load(){
  if(!playerId){showJoin();return}
  if(pending)return;
  pending=true;
  try{view=await api("/api/player-state/"+playerId);render();hideSplash()}
  catch(e){
    if(e.message.includes("Игрок не найден")){localStorage.removeItem(key);playerId="";showJoin()}
    else{$("#teamBadge").textContent="ПОДКЛЮЧЕНИЕ…";hideSplash()}
  }finally{pending=false}
}
$("#joinForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$("#joinBtn");$("#joinError").textContent="";
  try{setBusy(btn,true,"ПОДКЛЮЧАЕМ…");await join($("#name").value.trim())}
  catch(err){$("#joinError").textContent=err.message}
  finally{setBusy(btn,false)}
});
$("#game").addEventListener("click",async e=>{
  const btn=e.target.closest(".answer");
  if(!btn||btn.disabled||busy)return;
  busy=true;
  document.querySelectorAll(".answer").forEach(b=>b.disabled=true);
  btn.classList.add("selected");
  try{
    await api("/api/answer",{method:"POST",body:JSON.stringify({playerId,option:Number(btn.dataset.option)})});
    await load();
  }catch(err){
    alert(err.message);
    await load();
  }finally{busy=false}
});
socket.on("state:changed",load);
socket.on("connect",load);
socket.on("disconnect",()=>{$("#teamBadge").textContent="НЕТ СВЯЗИ"});
if(playerId)load();else showJoin();
