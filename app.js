/* Clube de Leitura d'Elas — todas as gravações passam pelo RLS do Supabase. */
const $=id=>document.getElementById(id), cfg=window.CLUBE_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabasePublishableKey&&window.supabase);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let admin=false,participants=[],books=[],meetings=[],attendance=[],draws=[],currentMeeting=null,rolling=false;
let coverBookId=null,coverBusy=false,coverOptions=[];
let attendanceMode='checkin', attendanceSearch='', attendanceOnlyConfirmed=false, attendanceSaving=false;
let photoTargetId=null,photoSaving=false;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x?new Date(x).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}):'Data a definir';
function notify(s,error=false){const el=$('message');el.textContent=s;el.className='notice'+(error?' error':'');el.hidden=false;window.scrollTo({top:0,behavior:'smooth'});}
async function query(p){const {data,error}=await p;if(error)throw error;return data}
async function load(){if(!db)return;try{[participants,books,meetings,attendance,draws]=await Promise.all([query(db.from('participants').select('*').order('name')),query(db.from('books').select('*').order('title')),query(db.from('meetings').select('*').order('starts_at',{ascending:false})),query(db.from('attendance').select('*')),query(db.from('draws').select('*').order('created_at'))]);render();}catch(e){notify('Não foi possível carregar os dados: '+e.message,true)}}
function switchTab(t){document.querySelectorAll('.tab').forEach(el=>el.hidden=el.id!==`tab-${t}`);document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));}
function render(){if(!admin&&$('coverManager')){$('coverManager').hidden=true;coverBookId=null;}document.querySelectorAll('.admin-only').forEach(el=>{if(!['meetingFormPanel','participantEditor','authPanel','coverManager'].includes(el.id))el.hidden=!admin});$('loginToggle').textContent=admin?'Admin · Sair':'Entrar como admin';renderMeetings();renderParticipants();renderDraws();if(currentMeeting)renderDetail(currentMeeting);}
function isUpcoming(m){if(!m.starts_at)return false;const end=new Date(m.starts_at);end.setHours(23,59,59,999);return end>=new Date();}
function hostsLabel(m){return m.co_host?`${m.host||'A definir'} e ${m.co_host}`:m.host||'A definir'}
function hostsDetail(m){return `<p><strong>Anfitriã sorteada:</strong> ${safe(m.host||'A definir')}</p>${m.co_host?`<p><strong>Anfitriã convidada:</strong> ${safe(m.co_host)}</p>`:''}`}
function meetingCard(m,featured=false){const count=attendance.filter(a=>a.meeting_id===m.id&&a.confirmed).length;return `<article class="meeting-card ${featured?'featured':''}">${m.card_url?`<img src="${safe(m.card_url)}" alt="Card de divulgação do encontro" loading="lazy">`:'<div class="placeholder">Card do encontro em breve</div>'}<div class="content"><div class="eyebrow">${featured?'PRÓXIMA LEITURA':'ENCONTRO'}</div><h3>${safe(m.title||'Livro a definir')}</h3><div class="meta">${safe(fmt(m.starts_at))}<br>Anfitriãs: ${safe(hostsLabel(m))}<br>${safe(m.place||'Local a definir')}</div>${featured&&(!m.starts_at||!m.place||!m.card_url)?'<div class="soon">Em breve, mais informações sobre o encontro.</div>':''}<button class="outline" data-open="${safe(m.id)}">Ver detalhes${admin?` · ${count} confirmada(s)`:''}</button></div></article>`}
function renderMeetings(){
 const pastWasOpen=$('pastDisclosure')?.open||false;
 const selectedMeeting=$('drawMeeting').value;
 const future=meetings.filter(isUpcoming).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const unscheduled=meetings.filter(m=>!m.starts_at).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const featured=future[0]||unscheduled[0]||null;
 const previous=meetings.filter(m=>m.starts_at&&!isUpcoming(m)).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));
 const planned=meetings.filter(m=>m.id!==featured?.id&&isUpcoming(m)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const drafts=unscheduled.filter(m=>m.id!==featured?.id);
 $('meetingCards').innerHTML=featured?meetingCard(featured,true):`<div class="empty"><strong>Próximo encontro em preparação</strong><p>Assim que o livro ou a anfitriã forem cadastrados, as informações aparecerão aqui.</p></div>`;
 $('pastMeetings').innerHTML=`<details class="archive-disclosure" id="pastDisclosure"><summary><span><strong>Encontros anteriores</strong><small>${previous.length} ${previous.length===1?'encontro registrado':'encontros registrados'}</small></span><span class="archive-chevron" aria-hidden="true">⌄</span></summary><div class="archive-body">${previous.length?`<div class="meeting-grid archive-grid">${previous.map(m=>meetingCard(m)).join('')}</div>`:'<p class="muted">Ainda não há encontros anteriores cadastrados.</p>'}</div></details>`+(planned.length||drafts.length?`<details class="archive-disclosure"><summary><span><strong>Outros encontros planejados</strong><small>${planned.length+drafts.length} ${planned.length+drafts.length===1?'encontro':'encontros'}</small></span><span class="archive-chevron" aria-hidden="true">⌄</span></summary><div class="archive-body"><div class="meeting-grid archive-grid">${[...planned,...drafts].map(m=>meetingCard(m)).join('')}</div></div></details>`:'');
 if(pastWasOpen)$('pastDisclosure').open=true;
 $('drawMeeting').innerHTML=meetings.map(m=>`<option value="${safe(m.id)}">${safe(m.title||'Livro a definir')} · ${safe(fmt(m.starts_at))}</option>`).join('');
 if(meetings.some(m=>m.id===selectedMeeting))$('drawMeeting').value=selectedMeeting;
 else if(featured)$('drawMeeting').value=featured.id;
}
function featuredMeeting(){
 const future=meetings.filter(isUpcoming).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const drafts=meetings.filter(m=>!m.starts_at).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 return future[0]||drafts[0]||null;
}
function readingBookId(){
 const m=featuredMeeting();if(!m)return null;
 const title=normalized(m.title).replace(/^(a|o) /,'');
 if(!title||title==='livro a definir')return null;
 return books.find(b=>normalized(b.title).replace(/^(a|o) /,'')===title)?.id||null;
}
function bookStatus(b){
 if(!b)return '';
 if(b.id===readingBookId())return '<span class="reading-status" aria-label="Livro em leitura pelo clube">◉ Em leitura</span>';
 return b.read_by_club?'<span class="read-status">✓ Lido pelo clube</span>':'';
}
function bookForParticipant(p){return books.find(b=>b.id===p?.suggested_book_id)}
function coverUrl(book){
 const src=book?.cover_url;
 if(!src)return '';
 try{const u=new URL(src);return u.protocol==='https:'?u.href:''}catch{return ''}
}
function bookCover(book){const url=coverUrl(book);return url?`<img class="book-cover" src="${safe(url)}" alt="Capa de ${safe(book.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cover-placeholder" hidden aria-hidden="true">📖</span>`:'<span class="cover-placeholder" aria-hidden="true">📖</span>'}

function initialsFor(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(n=>n[0]?.toLocaleUpperCase('pt-BR')||'').join('')||'?'}
function photoUrl(person){
 const src=person?.photo_url;
 if(!src)return '';
 try{let u=new URL(src);return u.protocol==='https:'?u.href:''}catch{return ''}
}
function participantAvatar(p){const src=photoUrl(p);const inner=src?`<img loading="lazy" src="${safe(src)}" alt="Foto de ${safe(p.name)}" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="member-initials" hidden aria-hidden="true">${safe(initialsFor(p.name))}</span>`:`<span class="member-initials" aria-hidden="true">${safe(initialsFor(p.name))}</span>`;return src?`<button type="button" class="member-avatar member-avatar-button" data-enlarge-photo="${safe(p.id)}" aria-label="Ampliar foto de ${safe(p.name)}" title="Ver foto inteira">${inner}</button>`:`<div class="member-avatar">${inner}</div>`}
function renderParticipants(){
 const visible=admin?participants:participants.filter(p=>p.active);
 $('participantList').innerHTML=visible.length?visible.map(p=>{
   const b=bookForParticipant(p);
   return `<div class="item participant-item member-card"><div class="participant-main member-main">
    ${participantAvatar(p)}
    <div class="member-details">
      <strong class="member-name">${safe(p.name)}</strong>
      ${b?`<div class="member-book"><div class="member-book-cover">${bookCover(b)}</div><div class="member-book-details"><span class="member-book-title">${safe(b.title)}</span>${b.author?`<span class="member-book-author">${safe(b.author)}</span>`:''}${bookStatus(b)}</div></div>`:'<div class="member-empty">Livro ainda não indicado</div>'}
      
    </div>
   </div>
   ${admin?`<div class="right member-actions"><button class="outline" data-edit-participant="${safe(p.id)}">Editar</button><button class="quiet" data-photo-person="${safe(p.id)}">${photoUrl(p)?'Trocar foto':'Adicionar foto'}</button>${photoUrl(p)?`<button class="quiet" data-remove-photo="${safe(p.id)}">Remover foto</button>`:''}${b?`<button class="quiet" data-cover-book="${safe(b.id)}">Capa</button>`:''}<button class="quiet" data-active="${safe(p.id)}">${p.active?'Desativar':'Reativar'}</button><button class="danger" data-delete-participant="${safe(p.id)}" aria-label="Excluir ${safe(p.name)}">Excluir</button></div>`:''}</div>`
 }).join(''):'<div class="empty">Nenhuma integrante cadastrada.</div>';
 if(admin&&!$('coverManager').hidden)renderCoverQueue();
}

function photoObjectPath(url){
 if(!url||!cfg.supabaseUrl)return null;
 const prefix=cfg.supabaseUrl.replace(/\/$/,'')+'/storage/v1/object/public/participant-photos/';
 return url.startsWith(prefix)?decodeURIComponent(url.slice(prefix.length)):null;
}
async function removeStoredPhoto(url){
 const path=photoObjectPath(url);
 if(path){const {error}=await db.storage.from('participant-photos').remove([path]);if(error)console.warn('Foto anterior não removida:',error.message)}
}
async function setParticipantPhoto(id,file){
 if(!admin||photoSaving) return;
 const p=participants.find(x=>x.id===id);
 if(!p)throw Error('Integrante não encontrada.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use uma foto JPG, PNG ou WebP.');
 if(file.size>4*1024*1024)throw Error('A foto precisa ter até 4 MB.');
 photoSaving=true;
 const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const objectPath=`${id}/${crypto.randomUUID()}.${extension}`;
 try{
  await query(db.storage.from('participant-photos').upload(objectPath,file,{contentType:file.type,upsert:false}));
  const url=db.storage.from('participant-photos').getPublicUrl(objectPath).data.publicUrl;
  try{await query(db.from('participants').update({photo_url:url}).eq('id',id))}
  catch(err){await db.storage.from('participant-photos').remove([objectPath]);throw err}
  if(p.photo_url)await removeStoredPhoto(p.photo_url);
  await load();notify(`Foto de ${p.name} salva!`);
 }finally{photoSaving=false}
}
async function clearParticipantPhoto(id){
 if(!admin||photoSaving)return;
 const p=participants.find(x=>x.id===id);
 if(!p?.photo_url)return;
 if(!confirm(`Remover a foto de ${p.name}? O avatar voltará a mostrar as iniciais.`))return;
 photoSaving=true;
 try{await query(db.from('participants').update({photo_url:null}).eq('id',id));await removeStoredPhoto(p.photo_url);await load();notify('Foto removida.')}finally{photoSaving=false}
}
function participantEditor(p){if(!admin)return;$('participantEditor').hidden=false;$('participantId').value=p?.id||'';$('participantName').value=p?.name||'';const b=bookForParticipant(p);$('participantBook').value=b?.title||'';$('participantAuthor').value=b?.author||'';$('participantRead').checked=!!b?.read_by_club;$('participantReadWrap').hidden=!b;$('participantFormHeading').textContent=p?'Editar integrante e indicação':'Cadastrar integrante e livro';$('participantEditor').scrollIntoView({behavior:'smooth',block:'start'});}
function renderDetail(id){const m=meetings.find(x=>x.id===id);if(!m)return;currentMeeting=id;const a=attendance.filter(x=>x.meeting_id===id);let detail=`<div class="panel"><div class="meeting-info"><div>${m.card_url?`<img class="meeting-banner" src="${safe(m.card_url)}" alt="Card do encontro">`:'<div class="placeholder">Encontro do Clube</div>'}</div><div><div class="eyebrow">NOSSO ENCONTRO</div><h2>${safe(m.title)}</h2><p>${safe(fmt(m.starts_at))}</p><p><strong>Local:</strong> ${safe(m.place||'A definir')}</p>${hostsDetail(m)}<p><strong>Confirmadas:</strong> ${a.filter(x=>x.confirmed).length} · <strong>Presentes:</strong> ${a.filter(x=>x.checked_in).length}</p>${admin?`<button class="outline" data-edit-meeting="${safe(id)}">Editar encontro</button>`:''}</div></div></div>`;
if(admin){
 const registered=participants.filter(p=>p.active||a.some(x=>x.participant_id===p.id));
 const present=a.filter(x=>x.checked_in).length, confirmed=a.filter(x=>x.confirmed).length;
 detail+=`<div class="panel attendance-panel">
  <div class="attendance-heading"><div><h3>Presença no encontro</h3><p class="muted">Toque no nome para marcar ou desfazer o check-in.</p></div>
  <div class="attendance-count"><strong>${present}</strong><span>presentes</span></div></div>
  <div class="attendance-modes" role="group" aria-label="Etapa de presença">
   <button type="button" class="${attendanceMode==='checkin'?'selected':''}" data-attendance-mode="checkin">Check-in</button>
   <button type="button" class="${attendanceMode==='confirmed'?'selected':''}" data-attendance-mode="confirmed">Confirmações <small>${confirmed}</small></button>
  </div>
  <div class="attendance-tools">
   <input id="attendanceSearch" type="search" placeholder="Buscar integrante..." aria-label="Buscar integrante" value="${safe(attendanceSearch)}">
   ${attendanceMode==='checkin'?`<label class="attendance-filter"><input id="attendanceOnlyConfirmed" type="checkbox" ${attendanceOnlyConfirmed?'checked':''}> Só confirmadas</label>`:''}
  </div>
  <div class="attendance-summary">${confirmed} confirmadas · ${present} presentes · ${registered.length} integrantes</div>
  <div id="attendanceRows" class="attendance-rows"></div>
 </div>`;
}else{detail+=`<div class="panel"><h3>Confirmadas</h3><div class="rows">${a.filter(x=>x.confirmed).map(x=>{let p=participants.find(p=>p.id===x.participant_id);return p?`<div class="item"><strong>${safe(p.name)}</strong><span class="badge ${x.checked_in?'yes':''}">${x.checked_in?'Presente':'Confirmada'}</span></div>`:''}).join('')||'<p class="muted">Ainda sem confirmações.</p>'}</div></div>`;}
$('meetingDetail').innerHTML=detail;$('meetingDetail').hidden=false;if(admin)renderAttendanceRows();}
function renderAttendanceRows(){
 const root=$('attendanceRows');if(!root||!admin||!currentMeeting)return;
 const rows=attendance.filter(a=>a.meeting_id===currentMeeting);
 const queryText=normalized(attendanceSearch);
 let people=participants.filter(p=>p.active||rows.some(r=>r.participant_id===p.id));
 if(queryText)people=people.filter(p=>normalized(p.name).includes(queryText));
 if(attendanceMode==='checkin'&&attendanceOnlyConfirmed)people=people.filter(p=>rows.some(r=>r.participant_id===p.id&&r.confirmed));
 people.sort((p,q)=>{
  if(attendanceMode==='checkin'){
   const a=rows.find(r=>r.participant_id===p.id),b=rows.find(r=>r.participant_id===q.id);
   const priority=x=>x?.checked_in?0:x?.confirmed?1:2;
   if(priority(a)!==priority(b))return priority(a)-priority(b);
  }
  return p.name.localeCompare(q.name,'pt-BR');
 });
 root.innerHTML=people.length?people.map(p=>{
  const row=rows.find(r=>r.participant_id===p.id);
  const flagged=attendanceMode==='checkin'?!!row?.checked_in:!!row?.confirmed;
  return `<button type="button" class="attendance-person ${flagged?'marked':''}" data-attendance-person="${safe(p.id)}" aria-pressed="${flagged}" ${attendanceSaving?'disabled':''}>
   <span class="attendance-person-name">${safe(p.name)}</span>
   <span class="attendance-person-status">${flagged?'✓ '+(attendanceMode==='checkin'?'Presente':'Confirmada'):attendanceMode==='checkin'?'Marcar presença':'Confirmar'}</span>
  </button>`;
 }).join(''):'<p class="muted">Nenhuma integrante encontrada.</p>';
}
function renderDraws(){
 const mid=$('drawMeeting').value||meetings[0]?.id;
 const d=draws.filter(x=>x.meeting_id===mid);
 const accepted=d.find(x=>x.status==='accepted');
 const last=accepted||d.at(-1);
 $('drawHistory').innerHTML=d.length?d.map(x=>{let p=participants.find(p=>p.id===x.participant_id),b=books.find(b=>b.id===x.book_id);return `<div class="item draw-history-item"><div><strong>${safe(p?.name||'Participante')}</strong><div class="small">${safe(b?.title||'Livro a indicar')}</div></div><span class="badge ${x.status==='accepted'?'yes':''}">${x.status==='accepted'?'✓ Aceitou':x.status==='skipped'?'Não disponível':'Aguardando resposta'}</span></div>`}).join(''):'<div class="empty">Ainda não houve sorteio neste encontro.</div>';
 $('rollingName').textContent=last?participants.find(p=>p.id===last.participant_id)?.name||'Quem será?':'Quem será?';
 $('rollingBook').textContent=last?(books.find(b=>b.id===last.book_id)?.title||'Livro a indicar') : '';
 $('drawDisplay').classList.toggle('accepted',!!accepted);
 $('drawAccepted').hidden=!accepted;
 $('drawBtn').textContent=d.length?'↻ Sortear novamente':'Iniciar sorteio';
 $('drawBtn').hidden=!admin||!!accepted;
 $('acceptBtn').hidden=!(admin&&last?.status==='pending'&&!accepted);
 $('resetDraws').hidden=!admin||!d.length;
 $('drawNote').textContent=accepted?'Resultado aceito e registrado para este encontro.':d.length?`${d.filter(x=>x.status==='skipped').length} sorteada(s) excluída(s) das próximas tentativas. Confirme quando a pessoa aceitar.`:'Participam todas as integrantes com check-in, mesmo sem livro indicado. A sorteada pode indicar o livro depois.';
}
async function saveAttendance(person,changes){let m=currentMeeting;if(!m)return;let old=attendance.find(x=>x.meeting_id===m&&x.participant_id===person);let row={meeting_id:m,participant_id:person,confirmed:old?.confirmed||false,checked_in:old?.checked_in||false,suggested_book_id:old?.suggested_book_id||participants.find(p=>p.id===person)?.suggested_book_id||null,...changes};if(row.checked_in)row.confirmed=true;if(!row.confirmed)row.checked_in=false;await query(db.from('attendance').upsert(row,{onConflict:'meeting_id,participant_id'}));await load();}
function meetingEditor(m){
 $('meetingFormPanel').hidden=false;
 $('meetingId').value=m?.id||'';
 $('meetingTitle').value=m?.title||'';
 $('meetingDate').value=m?.starts_at?new Date(new Date(m.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 const select=$('meetingHost');
 const savedHost=m?.host?.trim()||'';
 const options=participants.filter(p=>p.active||p.name===savedHost).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 select.innerHTML='<option value="">Selecione uma integrante</option>'+options.map(p=>`<option value="${safe(p.name)}">${safe(p.name)}</option>`).join('');
 // Preserve os nomes de anfitriãs cadastrados anteriormente que não correspondam
 // exatamente a uma integrante (ex.: um encontro com duas anfitriãs).
 if(savedHost&&!options.some(p=>p.name===savedHost)){
   const legacy=document.createElement('option');
   legacy.value=savedHost;legacy.textContent=savedHost+' (cadastro anterior)';
   select.appendChild(legacy);
 }
 select.value=savedHost;
 const coSelect=$('meetingCoHost');
 const savedCoHost=m?.co_host?.trim()||'';
 const coOptions=participants.filter(p=>p.active||p.name===savedCoHost).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 coSelect.innerHTML='<option value="">Nenhuma · escolher depois</option>'+coOptions.map(p=>`<option value="${safe(p.name)}">${safe(p.name)}</option>`).join('');
 if(savedCoHost&&!coOptions.some(p=>p.name===savedCoHost)){
  const legacy=document.createElement('option');legacy.value=savedCoHost;legacy.textContent=savedCoHost+' (cadastro anterior)';coSelect.appendChild(legacy);
 }
 coSelect.value=savedCoHost;
 $('meetingPlace').value=m?.place||'';
 $('meetingImage').value='';
 $('meetingFormPanel').scrollIntoView({behavior:'smooth'});
}
async function runDraw(){
 if(!admin||rolling)return;
 const mid=$('drawMeeting').value;
 if(!mid)return notify('Cadastre um encontro primeiro.',true);
 const previous=draws.filter(d=>d.meeting_id===mid);
 if(previous.some(d=>d.status==='accepted'))return notify('Este sorteio já tem resultado confirmado. Para começar de novo, reinicie a rodada.',true);
 // Todas as presentes concorrem, mesmo que ainda não tenham livro indicado.
 const eligible=attendance.filter(x=>x.meeting_id===mid&&x.checked_in&&!previous.some(d=>d.participant_id===x.participant_id));
 if(!eligible.length)return notify('Não há mais integrantes presentes disponíveis para sorteio.',true);
 rolling=true;$('drawBtn').disabled=true;
 const interval=setInterval(()=>{
  const pick=eligible[Math.floor(Math.random()*eligible.length)];
  $('rollingName').textContent=participants.find(p=>p.id===pick.participant_id)?.name||'';
  $('rollingBook').textContent=books.find(b=>b.id===(pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id))?.title||'Livro a indicar';
 },75);
 setTimeout(async()=>{
  clearInterval(interval);
  try{
   const random=new Uint32Array(1);crypto.getRandomValues(random);
   const pick=eligible[random[0]%eligible.length];
   const lastPending=previous.filter(d=>d.status==='pending').at(-1);
   if(lastPending)await query(db.from('draws').update({status:'skipped'}).eq('id',lastPending.id));
   await query(db.from('draws').insert({meeting_id:mid,participant_id:pick.participant_id,book_id:pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id||null,status:'pending'}));
   await load();
  }catch(e){notify(e.message,true)}finally{rolling=false;$('drawBtn').disabled=false}
 },2600);
}
// A indicação posterior atualiza o sorteio aceito e o rascunho ligado a ele,
// sem reescrever encontros históricos ou títulos já alterados manualmente.
async function syncPendingBookForAcceptedDraw(participantId,bookId){
 if(!bookId)return;
 const acceptedWithoutBook=draws.filter(d=>d.participant_id===participantId&&d.status==='accepted'&&!d.book_id);
 if(!acceptedWithoutBook.length)return;
 const book=books.find(b=>b.id===bookId) || await query(db.from('books').select('*').eq('id',bookId).single());
 for(const d of acceptedWithoutBook){
  await query(db.from('draws').update({book_id:bookId}).eq('id',d.id));
  const draft=meetings.find(m=>m.source_draw_id===d.id);
  if(draft&&(!draft.title||draft.title==='Livro a definir')){
   await query(db.from('meetings').update({title:book.title}).eq('id',draft.id));
  }
 }
}

// Busca sob demanda: nunca seleciona automaticamente uma edição incorreta.
function renderCoverQueue(){
 const pending=books.filter(b=>!coverUrl(b)&&participants.some(p=>p.suggested_book_id===b.id));
 const covered=books.filter(b=>coverUrl(b)&&participants.some(p=>p.suggested_book_id===b.id));
 $('coverQueue').innerHTML=`<p class="muted">${pending.length} livro(s) sem capa · ${covered.length} com capa salva</p>`+
   (pending.length?pending.map(b=>`<div class="item cover-queue-item"><span><strong>${safe(b.title)}</strong><br><small>${safe(b.author||'Autoria não cadastrada')}</small></span><button class="outline" data-cover-book="${safe(b.id)}">Pesquisar capa</button></div>`).join(''):'<p class="muted">Todos os livros indicados já têm capa.</p>');
}
function showCoverManager(){if(!admin)return;$('coverManager').hidden=false;$('coverEditor').hidden=true;renderCoverQueue();$('coverManager').scrollIntoView({behavior:'smooth',block:'start'});}
function normalized(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function matchQuality(book,result){
 let t=normalized(book.title),r=normalized(result.title);
 let a=normalized(book.author),ra=normalized(result.author);
 return (t===r?10:t&&r&&(t.includes(r)||r.includes(t))?4:0)+(a&&ra&&(a===ra||ra.includes(a)||a.includes(ra))?5:0);
}
async function fetchCovers(book){
 const q=[book.title,book.author].filter(Boolean).join(' ');
 const queries=[
  (async()=>{const r=await fetch('https://www.googleapis.com/books/v1/volumes?'+new URLSearchParams({q,maxResults:'20',printType:'books',langRestrict:'pt'}),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Google Books indisponível');const j=await r.json();return (j.items||[]).map(i=>{const v=i.volumeInfo||{};return {title:v.title||'',author:(v.authors||[]).join(', '),url:v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail||'',source:'Google Books'}})})(),
  (async()=>{const r=await fetch('https://openlibrary.org/search.json?'+new URLSearchParams({title:book.title,author:book.author||'',limit:'12',fields:'title,author_name,cover_i'}),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Open Library indisponível');const j=await r.json();return (j.docs||[]).filter(d=>d.cover_i).map(d=>({title:d.title||'',author:(d.author_name||[]).slice(0,2).join(', '),url:`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,source:'Open Library'}))})()
 ];
 const settled=await Promise.allSettled(queries);
 if(settled.every(x=>x.status==='rejected'))throw Error('Os catálogos estão indisponíveis. Tente novamente ou envie sua própria capa.');
 const candidates=settled.filter(x=>x.status==='fulfilled').flatMap(x=>x.value).filter(x=>x.url).map(x=>({...x,url:x.url.replace(/^http:/,'https:')}));
 const filtered=candidates.filter(x=>matchQuality(book,x)>=4).sort((a,b)=>matchQuality(book,b)-matchQuality(book,a));
 const seen=new Set();return filtered.filter(x=>{const k=x.url;if(seen.has(k))return false;seen.add(k);return true}).slice(0,8);
}
async function openCoverSearch(id){
 if(!admin)return;
 const book=books.find(b=>b.id===id);if(!book)return;
 coverBookId=id;coverBusy=true;coverOptions=[];
 $('coverManager').hidden=false;$('coverEditor').hidden=false;
 $('coverBookTitle').textContent=`Capa para “${book.title}”`;
 $('coverResults').innerHTML='';$('coverFeedback').textContent='Pesquisando sugestões pelo título e autor…';
 $('coverFile').value='';$('uploadCover').disabled=false;
 $('coverManager').scrollIntoView({behavior:'smooth',block:'start'});
 try{
  const results=await fetchCovers(book);
  if(coverBookId!==id)return;
  $('coverFeedback').textContent=results.length?'Confira a edição e toque em “Usar esta capa”.':'Não encontrei uma capa correspondente. Você pode enviar uma imagem.';
  $('coverResults').innerHTML=results.map((r,i)=>`<article class="cover-choice"><img src="${safe(r.url)}" alt="Sugestão de capa ${i+1}" loading="lazy" referrerpolicy="no-referrer"><div class="cover-choice-text"><strong>${safe(r.title)}</strong><small>${safe(r.author)}</small><small>${safe(r.source)}</small></div><button class="outline" data-choose-cover="${i}">Usar esta capa</button></article>`).join('');
  coverOptions=results;
 }catch(err){$('coverFeedback').textContent=err.message;}finally{coverBusy=false}
}
async function saveCover(url){
 if(!admin||!coverBookId)return;
 const u=new URL(url);if(u.protocol!=='https:')throw Error('A imagem deve usar HTTPS.');
 await query(db.from('books').update({cover_url:url}).eq('id',coverBookId));
 coverBookId=null;$('coverEditor').hidden=true;
 await load();notify('Capa salva! Ela aparecerá para todas as integrantes.');
}
async function uploadCover(){
 if(!admin||!coverBookId)return;
 const file=$('coverFile').files?.[0];if(!file)throw Error('Selecione uma imagem para enviar.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Envie uma imagem JPG, PNG ou WebP.');
 if(file.size>3*1024*1024)throw Error('A imagem deve ter até 3 MB.');
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];
 const path=`${coverBookId}/${crypto.randomUUID()}.${ext}`;
 await query(db.storage.from('book-covers').upload(path,file,{contentType:file.type,upsert:false}));
 const url=db.storage.from('book-covers').getPublicUrl(path).data.publicUrl;
 await saveCover(url);
}
document.addEventListener('click',async e=>{
 const photoButton=e.target.closest('[data-photo-person]');
 if(photoButton&&admin&&!photoSaving){photoTargetId=photoButton.dataset.photoPerson;const el=$('participantPhotoInput');el.value='';el.click();return}
 const removeButton=e.target.closest('[data-remove-photo]');
 if(removeButton&&admin){try{await clearParticipantPhoto(removeButton.dataset.removePhoto)}catch(err){notify('Erro ao remover foto: '+err.message,true)}}
});
document.addEventListener('change',async e=>{
 if(e.target.id!=='participantPhotoInput'||!photoTargetId||!admin)return;
 const file=e.target.files?.[0];const personId=photoTargetId;photoTargetId=null;
 if(!file)return;
 try{notify('Enviando foto...');await setParticipantPhoto(personId,file)}catch(err){notify('Não foi possível salvar a foto: '+err.message,true)}
 finally{e.target.value=''}
});
async function initial(){const logo=$('logo');logo.onerror=()=>{logo.hidden=true};$('setup').hidden=configured;document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('loginToggle').onclick=async()=>{if(admin){await db.auth.signOut();admin=false;$('authPanel').hidden=true;render()}else{$('authPanel').hidden=!$('authPanel').hidden;$('authPanel').scrollIntoView({behavior:'smooth'})}};$('logout').onclick=async()=>{await db.auth.signOut();admin=false;render()};$('loginForm').onsubmit=async e=>{e.preventDefault();if(!db)return notify('Configure o Supabase primeiro.',true);try{await query(db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await checkAdmin();$('authPanel').hidden=admin;if(!admin)notify('A conta existe, mas não está autorizada como admin.',true);}catch(err){notify('Não foi possível entrar: '+err.message,true)}};
$('openCoverManager').onclick=showCoverManager;
 $('closeCoverManager').onclick=()=>{$('coverManager').hidden=true;coverBookId=null};
 $('cancelCover').onclick=()=>{coverBookId=null;$('coverEditor').hidden=true;renderCoverQueue()};
 $('uploadCover').onclick=async()=>{if(coverBusy)return;try{$('uploadCover').disabled=true;await uploadCover()}catch(err){$('coverFeedback').textContent=err.message}finally{$('uploadCover').disabled=false}};
 $('participantBook').addEventListener('input',()=>{$('participantReadWrap').hidden=!$('participantBook').value.trim()});
 $('newParticipant').onclick=()=>participantEditor(null);$('cancelParticipant').onclick=()=>$('participantEditor').hidden=true;$('newMeeting').onclick=()=>meetingEditor(null);$('cancelMeeting').onclick=()=>$('meetingFormPanel').hidden=true;
$('meetingForm').onsubmit=async e=>{e.preventDefault();try{let old=meetings.find(m=>m.id===$('meetingId').value);let card_url=old?.card_url||'';let file=$('meetingImage').files[0];if(file){if(file.size>5242880)throw Error('O card deve ter até 5 MB.');const ext=file.name.split('.').pop().toLowerCase();const path=`${crypto.randomUUID()}.${ext}`;await query(db.storage.from('meeting-cards').upload(path,file,{contentType:file.type}));card_url=db.storage.from('meeting-cards').getPublicUrl(path).data.publicUrl}const row={title:$('meetingTitle').value.trim(),starts_at:$('meetingDate').value?new Date($('meetingDate').value).toISOString():null,place:$('meetingPlace').value.trim(),host:$('meetingHost').value.trim(),co_host:$('meetingCoHost').value.trim()||null,card_url};if(row.host&&row.co_host&&row.host===row.co_host)throw Error('Escolha duas integrantes diferentes para anfitriãs.');if(old)await query(db.from('meetings').update(row).eq('id',old.id));else await query(db.from('meetings').insert(row));$('meetingFormPanel').hidden=true;await load();notify('Encontro salvo!')}catch(err){notify(err.message,true)}};
$('participantForm').onsubmit=async e=>{e.preventDefault();if(!admin)return;const btn=$('saveParticipant');btn.disabled=true;try{const id=$('participantId').value;const name=$('participantName').value.trim(),title=$('participantBook').value.trim(),author=$('participantAuthor').value.trim();if(!name)throw Error('Preencha o nome da integrante.');if(author&&!title)throw Error('Informe o título do livro ou deixe também a autoria em branco.');const readByClub=$('participantRead').checked;const old=participants.find(p=>p.id===id);const oldBook=bookForParticipant(old);let bookId=oldBook?.id||null;let createdBookId=null;
if(!title){bookId=null;}else if(!oldBook||oldBook.title!==title||oldBook.author!==author){const existing=books.find(b=>b.title.toLocaleLowerCase('pt-BR')===title.toLocaleLowerCase('pt-BR')&&b.author.toLocaleLowerCase('pt-BR')===author.toLocaleLowerCase('pt-BR'));if(existing){bookId=existing.id;}else{const result=await query(db.from('books').insert({title,author}).select('id').single());bookId=result.id;createdBookId=bookId;}}
try{if(old){await query(db.from('participants').update({name,suggested_book_id:bookId}).eq('id',id))}else{await query(db.from('participants').insert({name,suggested_book_id:bookId}))}}catch(err){if(createdBookId)await db.from('books').delete().eq('id',createdBookId);throw err;}
if(bookId&&oldBook?.id===bookId){await query(db.from('books').update({read_by_club:readByClub}).eq('id',bookId));}
if(old&&bookId){await syncPendingBookForAcceptedDraw(old.id,bookId);}
$('participantForm').reset();$('participantId').value='';$('participantEditor').hidden=true;await load();notify('Cadastro da integrante salvo!');}catch(err){notify(err.message,true)}finally{btn.disabled=false}};
async function deleteParticipant(id){
  if(!admin)return;
  const p=participants.find(person=>person.id===id);
  if(!p)return;
  // Evita apagar confirmações, check-ins e resultados de sorteios históricos.
  const [{count:attendanceCount,error:attendanceError},{count:drawCount,error:drawError}]=await Promise.all([
    db.from('attendance').select('participant_id',{count:'exact',head:true}).eq('participant_id',id),
    db.from('draws').select('participant_id',{count:'exact',head:true}).eq('participant_id',id)
  ]);
  if(attendanceError)throw attendanceError;
  if(drawError)throw drawError;
  if(attendanceCount||drawCount){
    notify(`Não é possível excluir ${p.name}: ela já possui registros de encontros ou sorteios. Use “Desativar” para preservar o histórico.`,true);
    return;
  }
  if(!confirm(`Excluir definitivamente ${p.name}? Essa ação não poderá ser desfeita. O livro continuará no catálogo.`))return;
  // As políticas RLS do Supabase restringem a exclusão ao Admin.
  await query(db.from('participants').delete().eq('id',id).select('id'));
  if($('participantId').value===id){$('participantEditor').hidden=true;$('participantId').value='';}
  await load();
  notify(`${p.name} foi excluída do cadastro.`);
}
document.body.addEventListener('click',async e=>{
 const mode=e.target.closest('[data-attendance-mode]');
 if(mode&&admin){attendanceMode=mode.dataset.attendanceMode;renderDetail(currentMeeting);return}
 const person=e.target.closest('[data-attendance-person]');
 if(!person||!admin||attendanceSaving)return;
 const pid=person.dataset.attendancePerson;
 const old=attendance.find(x=>x.meeting_id===currentMeeting&&x.participant_id===pid);
 const field=attendanceMode==='checkin'?'checked_in':'confirmed';
 attendanceSaving=true;person.disabled=true;
 try{
  await saveAttendance(pid,{[field]:!old?.[field]});
 }catch(err){notify(err.message,true);await load()}
 finally{attendanceSaving=false;renderAttendanceRows()}
});
document.body.addEventListener('input',e=>{
 if(e.target.id!=='attendanceSearch')return;
 attendanceSearch=e.target.value;renderAttendanceRows();
 const el=$('attendanceSearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}
});
document.body.addEventListener('change',e=>{
 if(e.target.id==='attendanceOnlyConfirmed'){attendanceOnlyConfirmed=e.target.checked;renderAttendanceRows()}
});
document.body.addEventListener('click',async e=>{let t=e.target.closest('[data-open],[data-edit-meeting],[data-active],[data-edit-participant],[data-delete-participant],[data-cover-book],[data-choose-cover]');if(!t)return;try{
 if(t.dataset.coverBook){await openCoverSearch(t.dataset.coverBook);return}
 if(t.dataset.chooseCover!==undefined){if(coverBusy)return;const candidate=coverOptions[Number(t.dataset.chooseCover)];if(candidate){await saveCover(candidate.url)}return}
 if(t.dataset.open){renderDetail(t.dataset.open);$('meetingDetail').scrollIntoView({behavior:'smooth'})}if(admin&&t.dataset.editParticipant)participantEditor(participants.find(p=>p.id===t.dataset.editParticipant));if(admin&&t.dataset.deleteParticipant)await deleteParticipant(t.dataset.deleteParticipant);if(admin&&t.dataset.editMeeting)meetingEditor(meetings.find(m=>m.id===t.dataset.editMeeting));if(admin&&t.dataset.active){let p=participants.find(p=>p.id===t.dataset.active);await query(db.from('participants').update({active:!p.active}).eq('id',p.id));await load()}}catch(err){notify(err.message,true)}});
document.body.addEventListener('change',async e=>{const t=e.target;if(!admin)return;try{if(t.dataset.flag)await saveAttendance(t.dataset.person,{[t.dataset.flag]:t.checked});}catch(err){notify(err.message,true);await load()}});
$('drawMeeting').onchange=renderDraws;$('drawBtn').onclick=runDraw;$('acceptBtn').onclick=async()=>{
 if(!admin||rolling)return;
 const mid=$('drawMeeting').value, d=draws.filter(x=>x.meeting_id===mid).at(-1);
 if(!d||d.status!=='pending')return;
 const name=participants.find(p=>p.id===d.participant_id)?.name||'a participante';
 const book=books.find(b=>b.id===d.book_id);
 const description=book?`o próximo livro será “${book.title}”`:'o livro será indicado depois';
 if(!confirm(`Confirmar que ${name} aceitou ser anfitriã e que ${description}?`))return;
 try{
  await query(db.from('draws').update({status:'accepted'}).eq('id',d.id));
  let draftCreated=false,draftError=null;
  const existing=meetings.find(m=>m.source_draw_id===d.id);
  if(!existing){
   try{
    await query(db.from('meetings').insert({title:book?.title||'Livro a definir',host:name,co_host:null,place:'',card_url:'',starts_at:null,source_draw_id:d.id}));
    draftCreated=true;
   }catch(err){draftError=err;}
  }
  await load();
  if(draftError)notify('Aceite registrado, mas não foi possível criar o rascunho do encontro: '+draftError.message,true);
  else notify(draftCreated?`✓ Aceite registrado! Próximo encontro criado com ${book?'livro e anfitriã':'anfitriã; o livro pode ser indicado depois'}.`:'✓ Aceite registrado! O resultado está confirmado.');
 }catch(e){notify(e.message,true)}
};
$('resetDraws').onclick=async()=>{if(!admin||rolling)return;if(!confirm('Atenção: reiniciar apaga o histórico de sorteios deste encontro, inclusive resultados confirmados. Deseja continuar?'))return;try{await query(db.from('draws').delete().eq('meeting_id',$('drawMeeting').value));await load()}catch(e){notify(e.message,true)}};
if(db){await checkAdmin();await load()}}
async function checkAdmin(){const {data}=await db.auth.getUser();const user=data?.user;admin=false;if(user){try{const rows=await query(db.from('admins').select('user_id').eq('user_id',user.id));admin=rows.length>0}catch(e){console.warn(e)}}render()}
initial();

// Visualização ampliada da foto, disponível também sem login
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-enlarge-photo]');
 if(!button)return;
 const person=participants.find(p=>p.id===button.dataset.enlargePhoto);
 const image=photoUrl(person);if(!image)return;
 $('photoFull').src=image; $('photoFull').alt=`Foto de ${person.name}`;
 $('photoFullName').textContent=person.name;
 const modal=$('photoModal'); if(typeof modal.showModal==='function')modal.showModal();
 else modal.setAttribute('open','');
});
document.addEventListener('click',e=>{
 if(e.target.id==='photoClose'||e.target.id==='photoModal')$('photoModal').close();
});
