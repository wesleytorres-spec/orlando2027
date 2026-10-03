/* Orlando 2027 — app da família
   Dados fixos: dados.js · Dados da família (checklist, status, notas, plano): tabela "estado" no Supabase
   Funciona offline: as alterações ficam numa fila e sobem quando a internet volta. */

const CFG = window.ORL_CONFIG || {};
const CONFIGURED = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
const ALL=[...COMPRAS.map(x=>({...x,kind:'compras'})),...RESTAURANTES.map(x=>({...x,kind:'restaurantes'})),...PASSEIOS.map(x=>({...x,kind:'passeios'}))];
const BYID=Object.fromEntries(ALL.map(x=>[x.id,x]));

/* ============ ESTADO (chave → valor) ============ */
const LS={kv:'orl27_kv',q:'orl27_fila',me:'orl27_nome',tab:'orl27_tab',ex:'orl27_ex'};
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
let {KV={},META={}}=lsGet(LS.kv,{});
let QUEUE=lsGet(LS.q,[]);
let ME=lsGet(LS.me,'');
let SB=null, LIVE=false;

function persistLocal(){lsSet(LS.kv,{KV,META});lsSet(LS.q,QUEUE)}
function put(key,value){const em=new Date().toISOString();KV[key]=value;META[key]={por:ME,em};enqueue({op:'put',key,value,por:ME,em})}
function del(key){delete KV[key];delete META[key];enqueue({op:'del',key})}
function enqueue(item){QUEUE=QUEUE.filter(q=>q.key!==item.key);QUEUE.push(item);persistLocal();updateSync();flushSoon()}
let flushT=null;function flushSoon(){clearTimeout(flushT);flushT=setTimeout(flush,700)}
let flushing=false;
async function flush(){
  if(!SB||!LIVE||flushing||!QUEUE.length){updateSync();return}
  flushing=true;
  try{
    while(QUEUE.length){
      const q=QUEUE[0];
      const r=q.op==='put'
        ?await SB.from('estado').upsert({chave:q.key,valor:q.value,por:q.por||null,atualizado:q.em})
        :await SB.from('estado').delete().eq('chave',q.key);
      if(r.error)throw r.error;
      QUEUE.shift();persistLocal();
    }
  }catch(e){console.warn('sync',e)}
  finally{flushing=false;updateSync()}
}
async function pull(){
  if(!SB||!LIVE)return;
  const {data,error}=await SB.from('estado').select('chave,valor,por,atualizado').range(0,9999);
  if(error){console.warn('pull',error);return}
  const nk={},nm={};
  data.forEach(r=>{nk[r.chave]=r.valor;nm[r.chave]={por:r.por,em:r.atualizado}});
  QUEUE.forEach(q=>{if(q.op==='put'){nk[q.key]=q.value;nm[q.key]={por:q.por,em:q.em}}else{delete nk[q.key];delete nm[q.key]}});
  KV=nk;META=nm;persistLocal();rerenderSoon();
}
function onRemote(p){
  const key=(p.new&&p.new.chave)||(p.old&&p.old.chave);if(!key)return;
  if(QUEUE.some(q=>q.key===key))return; // alteração local ainda não enviada vence
  if(p.eventType==='DELETE'){delete KV[key];delete META[key]}
  else{KV[key]=p.new.valor;META[key]={por:p.new.por,em:p.new.atualizado}}
  persistLocal();rerenderSoon();
}

/* leitura */
const isDone=c=>{const v=KV['check:'+c.id];return v===undefined?!!c.def:!!v};
const isFav=id=>!!KV['fav:'+id];
const st=x=>KV['status:'+x.id]||x.status;
const ratingOf=id=>KV['rating:'+id]||0;
const noteOf=id=>KV['nota:'+id]||'';
const targetsOf=id=>Array.isArray(KV['alvos:'+id])?KV['alvos:'+id]:[];
const planOf=i=>Array.isArray(KV['plano:'+i])?KV['plano:'+i]:(SEED_PLAN[i]||[]);
const customs=()=>Object.keys(KV).filter(k=>k.startsWith('custom:')&&KV[k]).map(k=>({id:k.slice(7),cat:KV[k].cat||'Minhas tarefas',txt:KV[k].txt,def:false,custom:true})).sort((a,b)=>a.id.localeCompare(b.id));
const allChecks=()=>[...CHECK,...customs()];
const plannedDays=id=>ITIN.map((_,i)=>i).filter(i=>planOf(i).includes(id));

/* ============ UTIL ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const icon=(n,cls='')=>`<svg class="ico ${cls}"><use href="#i-${n}"/></svg>`;
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1500)}
function km(a){const R=6371,r=Math.PI/180,dl=(a.lat-HOTEL.lat)*r,dn=(a.lon-HOTEL.lon)*r;const x=Math.sin(dl/2)**2+Math.cos(HOTEL.lat*r)*Math.cos(a.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
const kmTxt=x=>km(x).toFixed(1).replace('.',',')+' km';
const dest=x=>x.q||x.end;
const gmaps=d=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(d);
const gview=d=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d);
const waze=d=>'https://waze.com/ul?q='+encodeURIComponent(d)+'&navigate=yes';
const apple=d=>'https://maps.apple.com/?daddr='+encodeURIComponent(d);
function copyText(t,msg){
  const done=()=>toast(msg||'Copiado');
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){toast('Selecione e copie manualmente')}ta.remove()};
  try{navigator.clipboard.writeText(t).then(done,fallback)}catch(e){fallback()}
}
function quando(iso){if(!iso)return '';const d=new Date(iso),n=new Date();const hm=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});return d.toDateString()===n.toDateString()?'hoje '+hm:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+hm}

/* hora de Orlando */
function orl(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  const hh=(+p.hour)%24,mm=+p.minute;
  return {date:`${p.year}-${p.month}-${p.day}`,dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),min:hh*60+mm};
}
const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const fmtMin=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
function openInfo(x,now){
  if(!x.h)return {state:'na',label:x.kind==='passeios'?'Horário no app oficial':'Horário do parque'};
  const today=x.h[now.dow]||[];
  for(const [o,c] of today){const om=toMin(o),cm=toMin(c);if(now.min>=om&&now.min<cm){
    if(om===0&&cm===1440)return {state:'open',label:'Aberto 24h'};
    const left=cm-now.min;return {state:left<=60?'closing':'open',label:left<=60?`Fecha em ${left} min`:`Aberto até ${c}`}}}
  for(const [o] of today){if(toMin(o)>now.min)return {state:'closed',label:`Fechado · abre ${o}`}}
  for(let i=1;i<=7;i++){const d=(now.dow+i)%7,w=x.h[d];if(w&&w.length)return {state:'closed',label:`Fechado · abre ${i===1?'amanhã':DOW[d]} ${w[0][0]}`}}
  return {state:'closed',label:'Fechado'};
}
const peakNow=(x,now)=>{const h=now.min/60;return (x.picoH||[]).some(([a,b])=>h>=a&&h<b)};
function openPill(x,now){
  const o=openInfo(x,now);const cls={open:'ok',closing:'warn',closed:'off',na:'off'}[o.state];
  let out=`<span class="pill ${cls}"><span class="dot"></span>${esc(o.label)}</span>`;
  if((o.state==='open'||o.state==='closing')&&peakNow(x,now))out+=`<span class="pill hot">${icon('fire')}Pico agora</span>`;
  return out;
}
const isOpen=(x,now)=>['open','closing'].includes(openInfo(x,now).state);
const dateObj=d=>new Date(d+'T12:00:00');
const dayIndexOf=date=>Math.round((dateObj(date)-dateObj(TRIP_START))/864e5);
const fmtDate=(d,opt)=>dateObj(d).toLocaleDateString('pt-BR',opt||{day:'2-digit',month:'2-digit'});
function addDays(d,n){const x=dateObj(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}
const dowOf=d=>dateObj(d).getDay();

/* ============ SINCRONIZAÇÃO: indicador ============ */
function updateSync(){
  const el=$('#syncState');if(!el)return;
  let cls='off',txt='Só neste aparelho';
  if(CONFIGURED&&LIVE){
    if(!navigator.onLine){cls='pend';txt=QUEUE.length?`Offline · ${QUEUE.length} para enviar`:'Offline'}
    else if(QUEUE.length){cls='pend';txt=`Enviando ${QUEUE.length}…`}
    else{cls='ok';txt=ME?`Sincronizado · ${ME}`:'Sincronizado'}
  }
  el.className='sync '+cls;el.innerHTML=`<span class="dot"></span>${esc(txt)}`;
}

/* ============ NAVEGAÇÃO ============ */
const VIEWS=['hoje','roteiro','explorar','check','mais'];
function go(v,push=true){
  if(!VIEWS.includes(v))v='hoje';
  VIEWS.forEach(n=>{$('#v-'+n).hidden=n!==v});
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===v));
  if(push)try{history.replaceState(null,'','#'+v)}catch(e){}
  lsSet(LS.tab,v);window.scrollTo({top:0});render(v);
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>go(b.dataset.v));
const currentView=()=>VIEWS.find(v=>!$('#v-'+v).hidden)||'hoje';
function render(v){({hoje:renderHoje,roteiro:renderRoteiro,explorar:renderExplorar,check:renderCheck,mais:renderMais})[v]()}
let needRender=false;
function rerenderSoon(){
  const a=document.activeElement;
  if(sheetOpen()||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))){needRender=true;return}
  needRender=false;render(currentView());
}
document.addEventListener('focusout',()=>setTimeout(()=>{if(needRender)rerenderSoon()},300));

/* ============ HOJE ============ */
function placeMini(x,now){
  return `<div class="mini" data-open="${x.id}"><div style="min-width:0"><b>${esc(x.nome)}</b><span>${esc(x.cat)}${x.lat?' · '+kmTxt(x):''}</span></div><div class="d-flex flex-column align-items-end gap-1">${openPill(x,now)}</div></div>`;
}
function reservaAlerts(){
  const out=[];
  RESTAURANTES.filter(r=>r.resLevel>=2&&st(r)!=='Visitado').forEach(r=>{
    const days=plannedDays(r.id);
    if(days.length)days.forEach(i=>{const d=ITIN[i][0];const w=r.win60?addDays(d,-60):null;
      out.push({r,txt:`Planejado para ${fmtDate(d,{weekday:'short',day:'2-digit',month:'2-digit'})}.`+(w?` A janela de reserva abre em ${fmtDate(w,{day:'2-digit',month:'2-digit',year:'numeric'})}.`:` ${r.reserva}.`)})});
    else out.push({r,txt:(r.win60?`Reserva abre 60 dias antes do jantar (para 09/01, em ${fmtDate(addDays(TRIP_START,-60),{day:'2-digit',month:'2-digit',year:'numeric'})}). `:'')+'Escolha um dia no roteiro para calcular a data certa.'});
  });
  return out;
}
function describe(key,val){
  const [t,id]=[key.split(':')[0],key.slice(key.indexOf(':')+1)];
  const nome=BYID[id]?BYID[id].nome:'';
  switch(t){
    case 'check':{const c=allChecks().find(c=>c.id===id);return c?`${val?'concluiu':'reabriu'} “${c.txt}”`:null}
    case 'custom':return val?`criou a tarefa “${val.txt}”`:null;
    case 'fav':return nome?`${val?'favoritou':'desfavoritou'} ${nome}`:null;
    case 'status':return nome?`marcou ${nome} como ${val}`:null;
    case 'rating':return nome&&val?`deu ${val} estrela${val>1?'s':''} para ${nome}`:null;
    case 'nota':return nome?`anotou em ${nome}`:null;
    case 'alvos':return nome?`atualizou a lista de compras de ${nome}`:null;
    case 'plano':return ITIN[+id]?`mudou o plano de ${fmtDate(ITIN[+id][0])}`:null;
    case 'notas-viagem':return 'editou as notas da viagem';
  }
  return null;
}
function feed(){
  return Object.entries(META).filter(([,m])=>m&&m.por&&m.em).sort((a,b)=>b[1].em.localeCompare(a[1].em))
    .map(([k,m])=>({m,txt:describe(k,KV[k])})).filter(x=>x.txt).slice(0,6);
}
function renderHoje(){
  const now=orl(),di=dayIndexOf(now.date),hero=$('#hero'),body=$('#hojeBody');
  if(di<0){
    hero.innerHTML=`<div class="pass"><div class="main">
      <div class="eyebrow" style="color:var(--pass-lime)">Cartão de embarque · ${esc(VOO_IDA.cia)}</div>
      <div class="route"><div class="iata">GRU<small>São Paulo</small></div><div class="line">${icon('airplane')}</div><div class="iata" style="text-align:right">MCO<small>Orlando</small></div></div>
      <div class="meta tnum"><div><span>Data</span><b>09 JAN 27</b></div><div><span>Partida</span><b>${VOO_IDA.sai}</b></div><div><span>Chegada</span><b>${VOO_IDA.chega}</b></div></div>
    </div><div class="stub"><div class="big tnum">${-di}</div><small>dias para<br>embarcar</small></div></div>`;
  }else if(di<ITIN.length){
    const d=ITIN[di];
    hero.innerHTML=`<div class="pass"><div class="main">
      <div class="eyebrow" style="color:var(--pass-lime)">${DOW_LONG[now.dow]} · ${fmtDate(d[0],{day:'2-digit',month:'long'})}</div>
      <div class="today-title">${esc(d[1])}</div>
      <div class="meta"><div><span>Esforço</span><b>${EFFORT[d[2]]}</b></div><div><span>Hotel</span><b>Celebration</b></div><div><span>Volta</span><b>24/01</b></div></div>
    </div><div class="stub"><div class="big tnum">${di+1}</div><small>dia de<br>${ITIN.length}</small></div></div>`;
  }else{
    hero.innerHTML=`<div class="pass"><div class="main"><div class="eyebrow" style="color:var(--pass-lime)">Viagem concluída</div><div class="today-title">Orlando 2027 ficou para a história.</div></div><div class="stub"><div class="big">16</div><small>dias</small></div></div>`;
  }
  let h='';
  const showIdx=di<0?0:Math.min(di,ITIN.length-1);
  if(di<ITIN.length){
    const ids=planOf(showIdx).map(id=>BYID[id]).filter(Boolean);
    h+=`<div class="panel"><div class="d-flex justify-content-between align-items-baseline mb-1"><div class="eyebrow">${di<0?'Primeiro dia · 09/01':'Plano de hoje'}</div><button class="btn btn-sm btn-soft" style="min-height:34px" data-day="${showIdx}">Editar dia</button></div>
      ${di<0?`<h3 style="font-size:18px" class="mb-1">${esc(ITIN[0][1])}</h3>`:''}
      ${ids.length?ids.map(x=>placeMini(x,now)).join(''):'<div class="muted" style="font-size:14px">Nenhum lugar planejado. Toque em “Editar dia”.</div>'}</div>`;
  }
  if(di>=0&&di<ITIN.length){
    const near=[...COMPRAS,...RESTAURANTES].map(x=>BYID[x.id]).filter(x=>isOpen(x,now)).sort((a,b)=>km(a)-km(b)).slice(0,5);
    h+=`<div class="panel"><div class="eyebrow mb-1">Abertos agora, mais perto do hotel</div>${near.length?near.map(x=>placeMini(x,now)).join(''):'<div class="muted" style="font-size:14px">Nada aberto agora na base.</div>'}</div>`;
  }
  const pend=allChecks().filter(c=>!isDone(c));
  if(di<0){
    const tot=allChecks().length,pct=Math.round((tot-pend.length)/tot*100);
    h+=`<div class="panel"><div class="d-flex justify-content-between align-items-baseline"><div class="eyebrow">Preparação</div><b class="tnum">${pct}%</b></div>
      <div class="progress mt-2 mb-2"><div class="progress-bar" style="width:${pct}%"></div></div>
      ${pend.slice(0,4).map(c=>`<label class="citem m-0 mt-1" style="border:0;padding:8px 0;background:transparent"><input type="checkbox" data-ck="${c.id}"><span class="tx">${esc(c.txt)}<br><small class="muted" style="font-weight:600">${esc(c.cat)}</small></span></label>`).join('')}
      <button class="btn btn-line w-100 mt-2" data-go="check">Ver checklist completo (${pend.length} pendentes)</button></div>`;
  }
  const f=feed();
  if(f.length)h+=`<div class="panel feed"><div class="eyebrow mb-1">Atividade da família</div>${f.map(x=>`<div class="mini"><div style="min-width:0"><b>${esc(x.m.por)}</b><span>${esc(x.txt)}</span></div><span class="km">${esc(quando(x.m.em))}</span></div>`).join('')}</div>`;
  const al=reservaAlerts();
  if(al.length&&di<ITIN.length)h+=`<div class="panel"><div class="eyebrow mb-1">Reservas para não esquecer</div>${al.map(a=>`<div class="alert-row" data-open="${a.r.id}" style="cursor:pointer">${icon('calendar-plus')}<div><b>${esc(a.r.nome)}</b><span>${esc(a.txt)}</span></div></div>`).join('')}</div>`;
  h+=`<div class="panel"><div class="eyebrow mb-2">Atalhos</div><div class="actions">
    <a class="btn btn-u" href="${gmaps(HOTEL.addr)}" target="_blank" rel="noopener">${icon('building')}Hotel</a>
    <button class="btn btn-soft" data-quick="open">${icon('door-open')}Aberto</button>
    <button class="btn btn-soft" data-quick="food">${icon('cup-hot')}Comer</button></div></div>`;
  body.innerHTML=h;
}

/* ============ ROTEIRO ============ */
function renderRoteiro(){
  const now=orl(),di=dayIndexOf(now.date);
  $('#dayList').innerHTML=ITIN.map((d,i)=>{
    const dt=dateObj(d[0]);const ids=planOf(i).map(id=>BYID[id]).filter(Boolean);
    return `<button class="day ${i===di?'today':''} ${di>i?'past':''}" data-day="${i}">
      <div class="dnum"><span>${DOW[dt.getDay()]}</span><b class="tnum">${String(dt.getDate()).padStart(2,'0')}</b><span>jan</span></div>
      <div style="min-width:0"><div class="t">${esc(d[1])}</div><div class="s">${ids.length?esc(ids.map(x=>x.nome).join(' · ')):'Toque para planejar lugares'}</div></div>
      <div class="effort e-${d[2]}" title="Esforço ${EFFORT[d[2]]}"></div></button>`}).join('');
}
function openDay(i){
  const d=ITIN[i],dow=dowOf(d[0]),ids=planOf(i);
  const m=META['plano:'+i];
  const items=ids.map(id=>BYID[id]).filter(Boolean).map(x=>{
    let hrs='';if(x.h){const w=x.h[dow];hrs=w&&w.length?w.map(([o,c])=>o==='00:00'&&c==='24:00'?'24h':`${o}–${c}`).join(' e '):'Fechado neste dia'}
    const busy=(x.diasCheios||[]).includes(dow);
    return `<div class="mini"><div style="min-width:0" data-open="${x.id}"><b>${esc(x.nome)}</b><span>${hrs?esc(hrs)+' · ':''}${esc(x.zona||'')}</span>${busy?`<div class="mt-1"><span class="pill hot">${icon('people')}Dia de movimento forte</span></div>`:''}</div>
      <button class="xbtn" data-unplan="${i}:${x.id}" aria-label="Remover ${esc(x.nome)} deste dia">${icon('trash')}</button></div>`}).join('');
  const opts=ALL.filter(x=>!ids.includes(x.id)).sort((a,b)=>a.kind.localeCompare(b.kind)||a.nome.localeCompare(b.nome));
  const groups={compras:'Compras',restaurantes:'Restaurantes',passeios:'Parques e passeios'};
  openSheet({eye:`${DOW_LONG[dow]} · Dia ${i+1} de ${ITIN.length}`,title:fmtDate(d[0],{day:'2-digit',month:'long'})+' — '+d[1],sub:`Esforço: ${EFFORT[d[2]]}`+(m&&m.por?` · editado por ${m.por}, ${quando(m.em)}`:''),body:`
    <div class="panel"><div class="eyebrow mb-1">Lugares do dia</div>${items||'<div class="muted" style="font-size:14px">Nenhum lugar ainda.</div>'}</div>
    <div class="panel"><label class="eyebrow mb-2" for="addPlace">Adicionar ao dia</label>
      <div class="d-flex gap-2"><select id="addPlace" class="form-select">${Object.entries(groups).map(([k,lab])=>`<optgroup label="${lab}">${opts.filter(o=>o.kind===k).map(o=>`<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</optgroup>`).join('')}</select>
      <button class="btn btn-u px-3" data-plan="${i}" aria-label="Adicionar">${icon('plus-lg')}</button></div>
      <p class="source mt-2 mb-0">Os horários mostrados são os de ${DOW_LONG[dow].toLowerCase()}, o dia da semana deste dia.</p></div>`});
}

/* ============ EXPLORAR ============ */
const EX=Object.assign({kind:'compras',sort:'dist'},lsGet(LS.ex,{}),{filters:new Set(),q:''});
const CHIPS={
  compras:[['aberto','Aberto agora','door-open'],['fav','Favoritos','heart'],['clearance','Clearance'],['outlet','Outlets'],['shopping','Shoppings'],['disney','Disney'],['eletronicos','Eletrônicos'],['luxo','Luxo'],['Planejado','Planejados'],['Visitado','Visitados']],
  restaurantes:[['aberto','Aberto agora','door-open'],['fav','Favoritos','heart'],['reserva','Pede reserva'],['rapido','Rápido'],['especial','Jantar especial'],['americano','Americano'],['bbq','BBQ'],['asiatico','Asiático'],['italiano','Italiano'],['brasileiro','Brasileiro'],['sobremesa','Sobremesa'],['cafe','Café da manhã'],['Visitado','Visitados']],
  passeios:[['fav','Favoritos','heart'],['parque','Parques'],['noite','À noite'],['Planejado','Planejados'],['Visitado','Visitados']]
};
const saveEx=()=>lsSet(LS.ex,{kind:EX.kind,sort:EX.sort});
function renderExplorar(){
  document.querySelectorAll('#kindSeg button').forEach(b=>b.setAttribute('aria-selected',b.dataset.kind===EX.kind));
  if($('#q').value!==EX.q)$('#q').value=EX.q;$('#sort').value=EX.sort;
  $('#chips').innerHTML=CHIPS[EX.kind].map(([k,l,ic])=>`<button class="chip" data-chip="${k}" aria-pressed="${EX.filters.has(k)}">${ic?icon(ic):''}${l}</button>`).join('');
  renderList();
}
function renderList(){
  const now=orl(),q=norm(EX.q);
  let rows=ALL.filter(x=>x.kind===EX.kind);
  if(q)rows=rows.filter(x=>norm([x.nome,x.cat,x.zona,x.perfil,x.tipos,(x.lojas||[]).join(' '),x.menu,x.local,x.end].join(' ')).includes(q));
  EX.filters.forEach(f=>{
    if(f==='aberto')rows=rows.filter(x=>isOpen(x,now));
    else if(f==='fav')rows=rows.filter(x=>isFav(x.id));
    else if(f==='Planejado'||f==='Visitado')rows=rows.filter(x=>st(x)===f);
    else rows=rows.filter(x=>(x.tags||[]).includes(f));
  });
  if(EX.sort==='dist')rows.sort((a,b)=>km(a)-km(b));
  else if(EX.sort==='nome')rows.sort((a,b)=>a.nome.localeCompare(b.nome));
  else rows.sort((a,b)=>(a.zona||'').localeCompare(b.zona||'')||km(a)-km(b));
  $('#count').textContent=`${rows.length} ${rows.length===1?'lugar':'lugares'}`;
  let lastZ=null;
  $('#plist').innerHTML=rows.map(x=>{
    let head='';if(EX.sort==='zona'&&x.zona!==lastZ){lastZ=x.zona;head=`<div class="eyebrow mt-2">${esc(x.zona)}</div>`}
    const fav=isFav(x.id),s=st(x);
    const extra=x.kind==='restaurantes'?`<span class="pill off">${esc(x.preco)}</span>${x.resLevel>=2?`<span class="pill warn">${icon('calendar-plus')}Reserva</span>`:''}`:(x.tags||[]).includes('clearance')?`<span class="pill warn">${icon('tag')}Clearance</span>`:'';
    const rating=ratingOf(x.id)?`<span class="pill off">${icon('star-fill')}${ratingOf(x.id)}</span>`:'';
    return head+`<div class="prow" role="button" tabindex="0" data-open="${x.id}">
      <div style="min-width:0"><div class="d-flex align-items-center gap-2 mb-1"><span class="st ${s}">${s}</span></div><h3 class="nm">${esc(x.nome)}</h3>
        <div class="sub">${esc(x.cat)}${x.local?' · '+esc(x.local):''}</div>
        <div class="badges">${openPill(x,now)}${extra}${rating}</div></div>
      <div class="side"><button class="favbtn ${fav?'on':''}" data-fav="${x.id}" aria-label="${fav?'Remover dos':'Adicionar aos'} favoritos">${icon(fav?'heart-fill':'heart')}</button>
        <span class="km tnum">${kmTxt(x)}</span></div></div>`}).join('')||`<div class="empty">Nenhum lugar com esses filtros.<br><button class="btn btn-line mt-3" data-clear>Limpar filtros</button></div>`;
}

/* ============ DETALHE ============ */
let currentPlace=null;
function openPlace(id){
  const x=BYID[id];if(!x)return;currentPlace=id;const now=orl(),s=st(x);
  const fact=(ic,lab,val)=>val?`<div class="fact">${icon(ic)}<div><b>${lab}</b><span>${val}</span></div></div>`:'';
  let week='';
  if(x.h)week=`<div class="week tnum">${[1,2,3,4,5,6,0].map(d=>{const w=x.h[d];const t=w&&w.length?w.map(([o,c])=>o==='00:00'&&c==='24:00'?'24 horas':`${o}–${c}`).join(' e '):'Fechado';return `<span class="${d===now.dow?'now':''}">${DOW[d]}</span><span class="${d===now.dow?'now':''}">${t}</span>`}).join('')}</div>`;
  const units=x.unidades?x.unidades.map(u=>`<div class="mini" style="cursor:default"><div style="min-width:0"><b>${esc(u.rot)}</b><span>${esc(u.end)}</span></div><a class="btn btn-u px-3" href="${gmaps(u.end)}" target="_blank" rel="noopener" aria-label="Rota para ${esc(u.rot)}">${icon('sign-turn-right')}</a></div>`).join(''):'';
  const busyDays=(x.diasCheios||[]).map(d=>DOW_LONG[d]).join(', ');
  const pd=plannedDays(x.id);
  const sameZone=ALL.filter(o=>o.id!==x.id&&o.zona===x.zona&&o.kind!=='passeios').sort((a,b)=>km(a)-km(b)).slice(0,6);
  const ms=META['status:'+x.id];

  let b=`<div class="d-flex flex-wrap gap-2">${openPill(x,now)}${x.preco?`<span class="pill off">${esc(x.preco)}</span>`:''}${x.dist?`<span class="pill off">${icon('car-front')}${esc(x.dist)}${x.tempo?' · '+esc(x.tempo):''}</span>`:`<span class="pill off">${icon('geo-alt')}${kmTxt(x)} em linha reta</span>`}</div>`;
  b+=`<div class="actions">
    <a class="btn btn-u" href="${gmaps(dest(x))}" target="_blank" rel="noopener">${icon('sign-turn-right')}Google</a>
    <a class="btn btn-soft" href="${waze(dest(x))}" target="_blank" rel="noopener">${icon('signpost-split')}Waze</a>
    <a class="btn btn-soft" href="${apple(dest(x))}" target="_blank" rel="noopener">${icon('map')}Apple</a></div>`;
  if(units)b+=`<div class="panel"><div class="eyebrow mb-1">Unidades</div>${units}</div>`;
  if(x.perfil)b+=`<p class="m-0" style="font-size:15px;line-height:1.5">${esc(x.perfil)}</p>`;
  if(x.dica)b+=`<div class="tip"><b>Dica</b>${esc(x.dica)}</div>`;
  b+=`<div class="panel"><div class="eyebrow mb-2">Status da família</div><div class="statusseg">${['Wishlist','Planejado','Visitado'].map(v=>`<button data-setst="${x.id}:${v}" aria-pressed="${s===v}">${v}</button>`).join('')}</div>
    ${ms&&ms.por?`<span class="by">Alterado por ${esc(ms.por)}, ${esc(quando(ms.em))}</span>`:''}
    <label class="eyebrow mt-3 mb-2 d-block" for="planDay">Planejar para um dia</label>
    <div class="d-flex gap-2"><select id="planDay" class="form-select">${ITIN.map((d,i)=>`<option value="${i}">${fmtDate(d[0],{weekday:'short',day:'2-digit',month:'2-digit'})} · ${esc(d[1])}</option>`).join('')}</select><button class="btn btn-u px-3" data-planplace="${x.id}" aria-label="Adicionar ao dia">${icon('calendar-plus')}</button></div>
    ${pd.length?`<div class="d-flex flex-wrap gap-2 mt-2">${pd.map(i=>`<span class="pill ok">${icon('calendar3')}${fmtDate(ITIN[i][0],{weekday:'short',day:'2-digit',month:'2-digit'})}</span>`).join('')}</div>`:''}
    ${x.kind==='restaurantes'?`<div class="eyebrow mt-3 mb-1">Nota da família</div><div class="stars">${[1,2,3,4,5].map(n=>`<button data-rate="${x.id}:${n}" class="${ratingOf(x.id)>=n?'':'offstar'}" aria-label="${n} estrela${n>1?'s':''}">${icon('star-fill')}</button>`).join('')}</div>`:''}
  </div>`;
  if(x.kind!=='passeios'){
    b+=`<div class="panel facts">
      ${x.h?`<div class="fact">${icon('clock')}<div><b>Horários</b>${week}</div></div>`:fact('clock','Horários',esc(x.hTxt))}
      ${fact('people','Mais cheio',esc([x.pico,busyDays&&('dias: '+busyDays)].filter(Boolean).join(' · ')))}
      ${fact('stopwatch','Melhor horário',esc(x.melhor))}
      ${x.kind==='compras'?fact('tag','Clearance',esc(x.clear))+fact('p-circle','Estacionamento',esc(x.estac))+fact('ticket-perforated','Cupom / app',esc(x.cupom))+fact('bag','Tipos de loja',esc(x.tipos)):''}
      ${x.kind==='restaurantes'?fact('cup-hot','Cozinha · serviço',esc(x.cat+' · '+x.servico))+fact('calendar-plus','Reserva',esc(x.reserva))+fact('exclamation-triangle','Depósito / cancelamento',esc(x.deposito))+fact('info-circle','Dress code',esc(x.dress)):''}
      ${fact('geo-alt','Endereço',esc(x.end)+` <button class="btn btn-sm btn-soft mt-1" style="min-height:32px" data-copy="${esc(x.end)}">${icon('copy')}Copiar</button>`)}
    </div>`;
    if(x.lojas&&x.lojas.length)b+=`<div class="panel"><div class="eyebrow mb-2">Lojas de destaque</div><div class="brands">${x.lojas.map(l=>`<span>${esc(l)}</span>`).join('')}</div></div>`;
    if(x.menu)b+=`<div class="panel"><div class="eyebrow mb-1">Cardápio · destaques</div><p class="m-0" style="font-size:15px;line-height:1.5">${esc(x.menu)}</p></div>`;
  }
  if(x.kind==='compras'){
    const t=targetsOf(x.id);
    b+=`<div class="panel"><div class="eyebrow mb-1">O que comprar aqui</div>
      <div>${t.map((it,k)=>`<div class="target ${it.d?'done':''}"><input type="checkbox" data-tg="${x.id}:${k}" ${it.d?'checked':''} aria-label="Comprado"><span>${esc(it.t)}${it.por?`<span class="by">${it.d?'comprado':'pedido'} por ${esc(it.por)}</span>`:''}</span><button class="xbtn" style="width:34px;height:34px" data-tgdel="${x.id}:${k}" aria-label="Remover">${icon('x-lg')}</button></div>`).join('')}</div>
      <form class="d-flex gap-2 mt-2" data-tgadd="${x.id}"><input class="form-control" id="tgNew" placeholder="Ex.: tênis Nike 42, Spirit Jersey…" autocomplete="off"><button class="btn btn-u px-3" aria-label="Adicionar item">${icon('plus-lg')}</button></form></div>`;
  }
  const mn=META['nota:'+x.id];
  b+=`<div class="panel"><label class="eyebrow mb-2 d-block" for="plNote">Notas da família</label><textarea id="plNote" class="form-control" rows="3" data-note="${x.id}" placeholder="O que acharam, o que compraram, onde estacionaram…">${esc(noteOf(x.id))}</textarea>${mn&&mn.por?`<span class="by">Última edição: ${esc(mn.por)}, ${esc(quando(mn.em))}</span>`:''}</div>`;
  if(sameZone.length)b+=`<div class="panel"><div class="eyebrow mb-1">No mesmo trajeto · ${esc(x.zona)}</div>${sameZone.map(o=>placeMini(o,now)).join('')}</div>`;
  const links=[x.url&&`<a class="btn btn-line" href="${x.url}" target="_blank" rel="noopener">${icon('globe2')}Site oficial</a>`,x.menuUrl&&`<a class="btn btn-line" href="${x.menuUrl}" target="_blank" rel="noopener">${icon('journal-text')}Cardápio</a>`,`<a class="btn btn-line" href="${gview(dest(x))}" target="_blank" rel="noopener">${icon('box-arrow-up-right')}Ver no mapa</a>`].filter(Boolean);
  b+=`<div class="d-grid gap-2" style="grid-template-columns:repeat(${Math.min(links.length,2)},1fr)">${links.join('')}</div>`;
  b+=`<p class="source m-0">Dados de referência (base de 03/10/2026). Horários podem mudar até janeiro de 2027.</p>`;
  openSheet({eye:`${x.kind==='compras'?'Compras':x.kind==='restaurantes'?'Restaurante':'Passeio'} · ${x.zona||''}`,title:x.nome,sub:x.cat+(x.local?' · '+x.local:''),body:b});
}

/* ============ SHEET ============ */
let backdrop=null;
const sheetOpen=()=>$('#sheet').classList.contains('show');
function openSheet({eye,title,sub,body}){
  $('#shEye').textContent=eye||'';$('#shTitle').textContent=title||'';$('#shSub').textContent=sub||'';$('#shBody').innerHTML=body;
  const sh=$('#sheet');$('#shBody').scrollTop=0;
  if(!sheetOpen()){
    backdrop=document.createElement('div');backdrop.className='offcanvas-backdrop fade';document.body.appendChild(backdrop);
    backdrop.onclick=closeSheet;requestAnimationFrame(()=>backdrop.classList.add('show'));
    sh.classList.add('showing');requestAnimationFrame(()=>{sh.classList.add('show');sh.classList.remove('showing')});
    document.body.style.overflow='hidden';
  }
}
function closeSheet(){
  const sh=$('#sheet');sh.classList.add('hiding');sh.classList.remove('show');
  if(backdrop){backdrop.classList.remove('show');const b=backdrop;setTimeout(()=>b.remove(),250);backdrop=null}
  setTimeout(()=>sh.classList.remove('hiding'),300);document.body.style.overflow='';currentPlace=null;
  needRender=false;render(currentView());
}
$('#shClose').onclick=closeSheet;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetOpen())closeSheet()});

/* ============ CHECKLIST ============ */
let CKF='todos';
function renderCheck(){
  const list=allChecks(),done=list.filter(isDone).length,pct=Math.round(done/list.length*100);
  $('#ckPct').textContent=pct+'%';$('#ckBar').style.width=pct+'%';$('#ckSum').textContent=`${done} de ${list.length} concluídos`;
  document.querySelectorAll('#ckFilter .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===CKF));
  const rows=list.filter(c=>CKF==='todos'||(CKF==='ok'?isDone(c):!isDone(c)));
  const cats=[...new Set(rows.map(c=>c.cat))];
  $('#ckList').innerHTML=cats.map(cat=>`<div class="cgroup"><h3>${esc(cat)}</h3>${rows.filter(c=>c.cat===cat).map(c=>{const m=META['check:'+c.id];const by=m&&m.por?`<span class="by">${isDone(c)?'Concluído':'Reaberto'} por ${esc(m.por)} · ${esc(quando(m.em))}</span>`:'';
    return `<label class="citem ${isDone(c)?'done':''}"><input type="checkbox" data-ck="${c.id}" ${isDone(c)?'checked':''}><span class="tx">${esc(c.txt)}${by}</span>${c.custom?`<button class="del" data-ckdel="${c.id}" aria-label="Excluir tarefa">${icon('trash')}</button>`:''}</label>`}).join('')}</div>`).join('')||'<div class="empty">Nada por aqui.</div>';
}
document.querySelectorAll('#ckFilter .chip').forEach(c=>c.onclick=()=>{CKF=c.dataset.f;renderCheck()});
$('#ckAdd').addEventListener('submit',e=>{e.preventDefault();const v=$('#ckNew').value.trim();if(!v)return;put('custom:u'+Date.now(),{cat:'Minhas tarefas',txt:v});$('#ckNew').value='';renderCheck();toast('Tarefa adicionada')});

/* ============ VIAGEM / CONTA ============ */
function renderMais(){
  if(document.activeElement!==$('#tripNotes'))$('#tripNotes').value=KV['notas-viagem']||'';
  $('#hotelActions').innerHTML=`<a class="btn btn-u" href="${gmaps(HOTEL.addr)}" target="_blank" rel="noopener">${icon('sign-turn-right')}Google</a><a class="btn btn-soft" href="${waze(HOTEL.addr)}" target="_blank" rel="noopener">${icon('signpost-split')}Waze</a><button class="btn btn-soft" data-copy="${esc(HOTEL.addr)}">${icon('copy')}Copiar</button>`;
  const acc=$('#account');
  if(!CONFIGURED){acc.innerHTML=`<div class="eyebrow mb-1">Família</div><p class="muted m-0" style="font-size:14px">O banco compartilhado ainda não foi configurado (arquivo <code>config.js</code>). Por enquanto, tudo fica salvo só neste aparelho.</p>`;return}
  acc.innerHTML=`<div class="eyebrow mb-1">Família</div>
    <p class="m-0" style="font-size:15px">Você está como <b>${esc(ME||'—')}</b>.</p>
    <p class="muted" style="font-size:13.5px">O que você marca aparece para todos que entraram com o código da família.</p>
    <div class="d-flex gap-2"><input id="meName" class="form-control" value="${esc(ME)}" placeholder="Seu nome" autocomplete="nickname"><button class="btn btn-soft px-3" data-rename>Salvar</button></div>
    <button class="btn btn-line w-100 mt-2" data-logout>${icon('door-open')}Sair deste aparelho</button>`;
}
$('#tripNotes').addEventListener('input',e=>put('notas-viagem',e.target.value));
$('#bkCopy').onclick=()=>copyText(JSON.stringify({app:'orlando2027',v:6,exportedAt:new Date().toISOString(),KV}),'Backup copiado');
$('#bkRestore').onclick=()=>{
  const raw=$('#bkIn').value.trim();if(!raw){toast('Cole um backup primeiro');return}
  let kv;
  try{kv=backupToKV(JSON.parse(raw))}catch(e){toast('Backup inválido — confira o texto colado');return}
  Object.entries(kv).forEach(([k,v])=>put(k,v));
  $('#bkIn').value='';renderMais();toast(`Backup restaurado (${Object.keys(kv).length} itens)`);
};
/* aceita o backup novo (KV) e os formatos das versões anteriores */
function backupToKV(j){
  if(j.KV)return j.KV;
  const s=j.state||j,kv={};
  if(s.v===5){
    Object.entries(s.done||{}).forEach(([k,v])=>kv['check:'+k]=!!v);
    (s.custom||[]).forEach(c=>kv['custom:'+c.id]={cat:c.cat,txt:c.txt});
    (s.fav||[]).forEach(id=>kv['fav:'+id]=true);
    Object.entries(s.status||{}).forEach(([k,v])=>kv['status:'+k]=v);
    Object.entries(s.rating||{}).forEach(([k,v])=>{if(v)kv['rating:'+k]=v});
    Object.entries(s.notes||{}).forEach(([k,v])=>{if(v)kv['nota:'+k]=v});
    Object.entries(s.targets||{}).forEach(([k,v])=>kv['alvos:'+k]=v.map(i=>({t:i.t,d:!!i.d})));
    Object.entries(s.plan||{}).forEach(([k,v])=>kv['plano:'+k]=v);
    if(s.tripNotes)kv['notas-viagem']=s.tripNotes;
    return kv;
  }
  if(Array.isArray(s.checks)){
    s.checks.forEach((v,i)=>{if(CHECK[i])kv['check:'+CHECK[i].id]=!!v});
    (s.favorites||[]).forEach(n=>{const m=ALL.find(x=>norm(x.nome).includes(norm(n))||norm(n).includes(norm(x.nome)));if(m)kv['fav:'+m.id]=true});
    if(s.notes)kv['notas-viagem']=s.notes;
    return kv;
  }
  throw new Error('formato');
}

/* ============ EVENTOS ============ */
function addToPlan(i,id){const p=planOf(i).slice();if(!p.includes(id))p.push(id);put('plano:'+i,p);if(st(BYID[id])==='Wishlist')put('status:'+id,'Planejado')}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-fav],[data-open],[data-day],[data-go],[data-quick],[data-chip],[data-clear],[data-setst],[data-planplace],[data-plan],[data-unplan],[data-rate],[data-tgdel],[data-copy],[data-ckdel],[data-rename],[data-logout]');
  if(!t)return;const d=t.dataset;
  if(d.fav!==undefined){e.stopPropagation();const on=!isFav(d.fav);put('fav:'+d.fav,on);renderList();toast(on?'Favoritado':'Removido dos favoritos');return}
  if(d.ckdel){e.preventDefault();del('custom:'+d.ckdel);del('check:'+d.ckdel);renderCheck();return}
  if(d.copy!==undefined){e.preventDefault();copyText(d.copy,'Endereço copiado');return}
  if(d.rename!==undefined){const v=$('#meName').value.trim();if(!v){toast('Digite seu nome');return}ME=v;lsSet(LS.me,ME);updateSync();renderMais();toast('Nome salvo');return}
  if(d.logout!==undefined){logout();return}
  if(d.open){openPlace(d.open);return}
  if(d.day!==undefined){openDay(+d.day);return}
  if(d.go){go(d.go);return}
  if(d.quick){EX.kind=d.quick==='food'?'restaurantes':'compras';EX.filters=new Set(['aberto']);EX.q='';go('explorar');return}
  if(d.chip){EX.filters.has(d.chip)?EX.filters.delete(d.chip):EX.filters.add(d.chip);t.setAttribute('aria-pressed',EX.filters.has(d.chip));renderList();return}
  if(d.clear!==undefined){EX.filters.clear();EX.q='';renderExplorar();return}
  if(d.setst){const [id,v]=d.setst.split(':');put('status:'+id,v);openPlace(id);toast('Status: '+v);return}
  if(d.planplace){const i=+$('#planDay').value;addToPlan(i,d.planplace);openPlace(d.planplace);toast('Adicionado a '+fmtDate(ITIN[i][0]));return}
  if(d.plan!==undefined){addToPlan(+d.plan,$('#addPlace').value);openDay(+d.plan);toast('Adicionado');return}
  if(d.unplan){const [i,id]=d.unplan.split(':');put('plano:'+i,planOf(+i).filter(x=>x!==id));openDay(+i);return}
  if(d.rate){const [id,n]=d.rate.split(':');const v=ratingOf(id)==+n?0:+n;v?put('rating:'+id,v):del('rating:'+id);if(v&&st(BYID[id])!=='Visitado')put('status:'+id,'Visitado');openPlace(id);return}
  if(d.tgdel){const [id,k]=d.tgdel.split(':');const t2=targetsOf(id).slice();t2.splice(+k,1);put('alvos:'+id,t2);openPlace(id);return}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.prow')){e.preventDefault();openPlace(e.target.dataset.open)}});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.ck){put('check:'+t.dataset.ck,t.checked);if(currentView()==='check')renderCheck();else setTimeout(renderHoje,250);toast(t.checked?'Concluído':'Reaberto')}
  if(t.dataset.tg){const [id,k]=t.dataset.tg.split(':');const t2=targetsOf(id).map(o=>({...o}));if(t2[+k]){t2[+k].d=t.checked;t2[+k].por=ME;put('alvos:'+id,t2)}t.closest('.target').classList.toggle('done',t.checked)}
});
document.addEventListener('input',e=>{if(e.target.dataset.note)put('nota:'+e.target.dataset.note,e.target.value)});
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset.tgadd){e.preventDefault();const v=$('#tgNew').value.trim();if(!v)return;put('alvos:'+f.dataset.tgadd,[...targetsOf(f.dataset.tgadd),{t:v,d:false,por:ME}]);openPlace(f.dataset.tgadd);setTimeout(()=>$('#tgNew')&&$('#tgNew').focus(),50)}});
document.querySelectorAll('#kindSeg button').forEach(b=>b.onclick=()=>{EX.kind=b.dataset.kind;EX.filters.clear();saveEx();renderExplorar()});
$('#q').addEventListener('input',e=>{EX.q=e.target.value;renderList()});
$('#sort').addEventListener('change',e=>{EX.sort=e.target.value;saveEx();renderList()});

/* ============ LOGIN ============ */
function showLogin(msg){
  $('#login').hidden=false;if(!$('#lgName').value)$('#lgName').value=ME||'';
  const er=$('#lgErr');er.hidden=!msg;er.textContent=msg||'';
}
$('#lgForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('#lgName').value.trim(),code=$('#lgCode').value;
  if(!name){showLogin('Digite seu nome, para a família saber quem marcou cada coisa.');return}
  if(!code){showLogin('Digite o código da família.');return}
  const btn=$('#lgBtn');btn.disabled=true;btn.textContent='Entrando…';
  const {error}=await SB.auth.signInWithPassword({email:CFG.familyEmail,password:code});
  btn.disabled=false;btn.textContent='Entrar';
  if(error){showLogin(navigator.onLine?'Código incorreto. Confira com quem configurou o app.':'Sem internet. Conecte-se para entrar pela primeira vez.');return}
  ME=name;lsSet(LS.me,ME);$('#lgCode').value='';$('#login').hidden=true;startLive();
});
async function logout(){
  try{await flush()}catch(e){}
  if(QUEUE.length){toast('Ainda há alterações sem enviar. Conecte-se antes de sair.');return}
  try{await SB.auth.signOut()}catch(e){}
  LIVE=false;KV={};META={};QUEUE=[];persistLocal();updateSync();showLogin();
}
let channel=null;
function startLive(){
  LIVE=true;updateSync();
  if(!channel){
    channel=SB.channel('estado-familia')
      .on('postgres_changes',{event:'*',schema:'public',table:'estado'},onRemote)
      .subscribe(s=>{if(s==='SUBSCRIBED')pull()});
  }
  flush();pull();
}

/* ============ INÍCIO ============ */
function tick(){const n=orl();$('#orlClock').textContent=`${DOW[n.dow]} ${fmtMin(n.min)}`}
tick();
setInterval(()=>{tick();if(!sheetOpen()){const v=currentView();if(v==='hoje')renderHoje();else if(v==='explorar')renderList()}},60000);
window.addEventListener('online',()=>{updateSync();flush();pull()});
window.addEventListener('offline',updateSync);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){flush();pull()}});
setInterval(flush,30000);

let start=(location.hash||'').slice(1);
if(!VIEWS.includes(start))start=lsGet(LS.tab,'hoje');
go(start,false);updateSync();

(async()=>{
  if(!CONFIGURED)return;
  SB=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data}=await SB.auth.getSession();
  if(data&&data.session&&ME)startLive();else showLogin();
})();

if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
