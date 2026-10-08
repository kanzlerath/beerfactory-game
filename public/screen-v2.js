import {socket,$,api,escapeHtml,fmtPct,hideSplash} from "/common.js";

const stage=$("#stage");
const header=$("#logo");
const status=$("#status");
let lastScene="",timer=null,lastRevision=0;
header.innerHTML='<div class="row" style="gap:18px"><img src="/assets/beerfactory-mark.svg" alt="BeerFactory" width="52" height="76" style="object-fit:contain"><div><div class="wordmark-main" style="font-size:27px">ПИВОФЭКТОРИ <span style="color:var(--bf-orange)">/ КВИЗ</span></div><div class="eyebrow" style="margin-top:7px">12 лет ресторану-пивоварне · Красный проспект, 22</div></div></div>';

function listRow(t,index,compact=false){
  const indexText=String(index+1).padStart(2,"0");
  return '<div class="leader '+(t.winner?'winner':'')+'">'+
    '<div class="rank">'+indexText+'</div>'+
    '<div><b>'+escapeHtml(t.name||t.teamName)+'</b>'+
    '<div class="small muted">'+(compact?t.players+' участников':t.correct+' / '+t.eligible+' верно · '+fmtPct(t.accuracy))+'</div></div>'+
    '<div class="score">'+(compact?t.score:(t.winner?'+'+(t.awardedPoints||1):fmtPct(t.accuracy)))+'</div></div>';
}
function waiting(){
  return '<div class="screen-wait scene-fade">'+
    '<div class="anniversary-block"><div class="anniversary-number">12</div>'+
    '<div class="anniversary-copy"><div class="eyebrow">лет Пивофэктори</div>'+
    '<div class="anniversary-title">ИГРАЕМ<br>ВСЕМ ЗАЛОМ</div>'+
    '<p style="max-width:450px;font-size:clamp(18px,2vw,27px);line-height:1.32;margin:0">Сканируйте QR, выбирайте команду<br>и подключайтесь к игре.</p></div></div>'+
    '<div class="screen-join"><img src="/api/join-qr.svg" alt="QR-код для входа в игру">'+
    '<h2>ВХОД В ИГРУ</h2><p class="muted" style="font-size:16px;line-height:1.3;margin:0">Навести камеру телефона.<br>Ничего устанавливать не нужно.</p></div></div>';
}
function question(q,r){
  const count=(q.questionNumber || 1);
  const opts=q.options.map((o,i)=>
    '<div class="option"><span class="answer-badge">'+String.fromCharCode(65+i)+'</span><span>'+escapeHtml(o)+'</span></div>'
  ).join("");
  const title=(q.round||1)+' / '+escapeHtml(q.roundTitle||"Викторина")+' · '+String(count).padStart(2,"0");
  return '<div class="scene-fade"><div class="question-head"><div><div class="round-kicker">'+title+'</div>'+
    '<div class="question" style="margin-top:18px">'+escapeHtml(q.text)+'</div></div></div>'+
    '<div class="options">'+opts+'</div>'+
    '<div class="timer-row"><div id="timer" class="timer">--</div><div id="timerLabel" class="timer-label">СЕКУНД ДО ЗАКРЫТИЯ</div></div>'+
    '<div class="progress"><i id="bar"></i></div></div>';
}
function result(q,r){
  const rows=(r.results||[]).slice(0,7).map((x,i)=>listRow(x,i,false)).join("");
  const leader=(r.results||[]).filter(x=>x.winner).map(x=>x.teamName).join(", ");
  return '<div class="scene-fade"><div class="round-kicker">РАУНД '+(q.round||1)+' · '+escapeHtml(q.roundTitle||"Викторина")+' · ОТВЕТ</div>'+
    '<div class="result-answer" style="margin:24px 0 30px">'+escapeHtml(q.options[q.correctOption])+'</div>'+
    '<div style="border-top:1px solid var(--bf-line);padding-top:14px"><div class="row spread" style="margin-bottom:4px">'+
    '<div class="eyebrow">ИТОГИ ВОПРОСА</div><div class="eyebrow">'+(leader?'ЛИДИРУЕТ: '+escapeHtml(leader):'РЕЗУЛЬТАТЫ')+'</div></div>'+rows+'</div></div>';
}
function finalScreen(teams){
  if(!teams.length)return '<div class="scene-fade"><h1 class="question">СПАСИБО ЗА ИГРУ!</h1></div>';
  const top=teams[0].score;
  const winners=teams.filter(t=>t.score===top);
  return '<div class="scene-fade" style="padding-top:3vh">'+
    '<div class="round-kicker">12 ЛЕТ ПИВОФЭКТОРИ · ИТОГИ ИГРЫ</div>'+
    '<div class="anniversary-title" style="margin:32px 0 0;color:var(--bf-cream)">НАШИ<br>ПОБЕДИТЕЛИ</div>'+
    '<div style="margin-top:30px;font-size:clamp(35px,5vw,78px);font-family:Impact,Arial,sans-serif;color:var(--bf-orange)">'+
      winners.map(x=>escapeHtml(x.name)).join(' · ')+'</div>'+
    '<div style="font-size:22px;margin:12px 0 26px">Победный результат: '+top+' очков</div>'+
    '<div class="eyebrow">БЛАГОДАРИМ ЗА ИГРУ. ВСТРЕТИМСЯ ЗА СЛЕДУЮЩИМ СТОЛОМ.</div></div>';
}
function tick(r,q){
  const secs=Math.max(0,(r.endsAt-Date.now())/1000);
  const el=$("#timer"),bar=$("#bar"),label=$("#timerLabel");
  if(el)el.textContent=r.status==="closed"?"00":String(Math.ceil(secs)).padStart(2,"0");
  if(bar)bar.style.width=(r.status==="closed"?0:Math.min(100,secs/Math.max(1,q.durationSec)*100))+"%";
  if(label && r.status==="closed")label.textContent="ВРЕМЯ ВЫШЛО · ОЖИДАЕМ ОТВЕТ";
}
function render(d){
  const r=d.round,q=r.question;
  const key=[r.status,q?.id||"",r.startedAt||""].join(":");
  const all=d.teams||[];
  $("#online").textContent=all.length+' команд · '+all.reduce((a,t)=>a+t.players,0)+' участников';
  status.textContent=r.status==="open"?"ИДЁТ ВОПРОС":r.status==="closed"?"ОТВЕТЫ ЗАКРЫТЫ":r.status==="revealed"?"ИТОГИ РАУНДА":r.status==="final"?"ФИНАЛ":"СОБИРАЕМ КОМАНДЫ";
  $("#leaders").innerHTML=all.length?all.slice(0,6).map((t,i)=>listRow(t,i,true)).join(""):'<div style="padding:12px 0;color:var(--bf-muted)">Команды появятся после подключения гостей.</div>';
  if(key===lastScene)return;
  lastScene=key;
  clearInterval(timer);timer=null;
  if(r.status==="final"){stage.innerHTML=finalScreen(all);return}
  if(!q){stage.innerHTML=waiting();return}
  if(r.status==="revealed"){stage.innerHTML=result(q,r);return}
  stage.innerHTML=question(q,r);
  tick(r,q);
  if(r.status==="open")timer=setInterval(()=>tick(r,q),100);
}
let pending=false;
async function load(){
  if(pending)return;
  pending=true;
  try{const d=await api("/api/public-state");render(d);hideSplash()}
  catch(e){status.textContent="НЕТ СОЕДИНЕНИЯ";hideSplash()}
  finally{pending=false}
}
socket.on("state:changed",load);
socket.on("connect",load);
socket.on("disconnect",()=>{status.textContent="НЕТ СОЕДИНЕНИЯ"});
load();
