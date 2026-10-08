import {socket,$,api,escapeHtml,fmtPct,wordmark,hideSplash} from "/common.js";
let timer;
$("#logo").innerHTML=wordmark("LIVE");
async function load(){try{const d=await api("/api/public-state");render(d);hideSplash()}catch{$("#status").textContent="Нет связи"}}
function render(d){
  clearInterval(timer);
  const r=d.round,q=r.question,totalPlayers=d.teams.reduce((n,t)=>n+t.players,0);
  $("#online").textContent=`${totalPlayers} участников · ${d.teams.length} команд`;
  $("#status").textContent=r.status==="open"?"Идёт вопрос":r.status==="closed"?"Время вышло":r.status==="revealed"?"Результаты":"Ожидание игры";
  if(!q){
    $("#stage").innerHTML=`<div class="screen-wait fade-in"><div><div class="kicker">12 лет — полёт нормальный</div><div class="question" style="margin-top:12px">Сегодня играем<br>вместе со всем залом.</div><p class="muted" style="font-size:18px;max-width:620px;margin-top:20px;line-height:1.6">Сканируйте QR, выберите свою команду и укажите имя. Ничего устанавливать не нужно.</p></div><div class="join-box"><img class="qr-large" src="/api/join-qr.svg" alt="QR для входа в игру"><div><div class="eyebrow">Вход в игру</div><h2 style="font-size:30px;margin:8px 0">Сканируйте QR</h2><p class="muted" style="margin-bottom:0">Выберите свою команду. Вопрос появится на телефоне автоматически.</p></div></div></div>`;
  }else if(r.status==="revealed"){
    const answer=escapeHtml(q.options[q.correctOption]);
    const rows=(r.results||[]).map((x,i)=>`<div class="leader ${x.winner?"winner":""}" style="padding-left:15px;padding-right:15px;border-radius:14px"><div class="rank">${String(i+1).padStart(2,"0")}</div><div><b>${escapeHtml(x.teamName)}</b><div class="small muted">${x.correct} из ${x.eligible} правильно · ${fmtPct(x.accuracy)}</div></div><div class="score">${x.winner?"+1":fmtPct(x.accuracy)}</div></div>`).join("");
    $("#stage").innerHTML=`<div class="fade-in"><div class="eyebrow">Правильный ответ</div><div class="screen-answer" style="margin-top:10px">${answer}</div><div style="margin-top:34px">${rows}</div></div>`;
  }else{
    $("#stage").innerHTML=`<div class="fade-in"><div class="eyebrow">Вопрос</div><div class="question" style="margin-top:10px">${escapeHtml(q.text)}</div><div class="options" style="margin-top:30px">${q.options.map((o,i)=>`<div class="option"><span class="answer-badge">${String.fromCharCode(65+i)}</span>${escapeHtml(o)}</div>`).join("")}</div><div id="timer" class="timer" style="margin-top:30px"></div><div class="progress"><i id="bar"></i></div></div>`;
    const tick=()=>{const left=Math.max(0,(r.endsAt-Date.now())/1000),el=$("#timer"),bar=$("#bar");if(el)el.textContent=r.status==="open"?Math.ceil(left):"0";if(bar)bar.style.width=Math.max(0,Math.min(100,(left/q.durationSec)*100))+"%";};tick();timer=setInterval(tick,100);
  }
  $("#leaders").innerHTML=d.teams.length?d.teams.map(x=>`<div class="leader"><div class="rank">${String(x.rank).padStart(2,"0")}</div><div><b>${escapeHtml(x.name)}</b><div class="small muted">${x.players} участников</div></div><div class="score">${x.score}</div></div>`).join(""):'<p class="muted">Команды появятся после регистрации.</p>';
}
socket.on("state:changed",load);load();