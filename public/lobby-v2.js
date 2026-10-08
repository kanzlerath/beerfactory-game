import {socket,$,api,escapeHtml,hideSplash} from "/common.js";
$("#logo").innerHTML='<div class="row" style="gap:12px"><img src="/assets/beerfactory-mark.svg" alt="BeerFactory" width="35" height="52" style="object-fit:contain"><div><div class="wordmark-main" style="font-size:20px">ПИВОФЭКТОРИ</div><div class="wordmark-sub" style="margin-top:5px;color:var(--bf-orange)">КВИЗ · 12 ЛЕТ</div></div></div>';
let pending=false,again=false;
async function load(){
  if(pending){again=true;return}
  pending=true;
  try{
    const teams=await api("/api/public-teams");
    $("#empty").classList.toggle("hidden",teams.length>0);
    $("#teams").innerHTML=teams.map((t,i)=>
      '<a class="team-pick scene-fade" href="/join/'+t.joinCode+'">'+
      '<span class="eyebrow">КОМАНДА '+String(i+1).padStart(2,"0")+'</span>'+
      '<b>'+escapeHtml(t.name)+'</b>'+
      '<span class="muted small">'+t.players+' игроков · нажмите, чтобы присоединиться →</span></a>').join("");
    hideSplash();
  }catch(e){$("#empty").classList.remove("hidden");$("#empty").textContent="Не удалось связаться с сервером. Повторяем подключение…";hideSplash()}
  finally{pending=false;if(again){again=false;load()}}
}
socket.on("state:changed",load);
socket.on("connect",load);
load();
