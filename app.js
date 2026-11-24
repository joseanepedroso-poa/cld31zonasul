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
function render(){if(!admin&&$('coverManager')){$('coverManager').hidden=true;coverBookId=null;}document.querySelectorAll('.admin-only').forEach(el=>{if(!['meetingFormPanel','participantEditor','authPanel','coverManager'].includes(el.id))el.hidden=!admin});$('loginToggle').setAttribute('aria-label',admin?'Abrir opções administrativas':'Entrar como administrador');$('loginToggle').title=admin?'Opções administrativas':'Entrar como administrador';$('logout').hidden=!admin;$('loginForm').hidden=admin;renderMeetings();renderParticipants();renderDraws();if(currentMeeting)renderDetail(currentMeeting);}
function localDay(value){if(!value)return null;const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const get=type=>parts.find(part=>part.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}
function isPastMeeting(m){return !!m?.starts_at&&localDay(m.starts_at)<localDay(new Date());}
function isUpcoming(m){return !!m?.starts_at&&!isPastMeeting(m);}
function meetingBook(m){return books.find(b=>b.id===m?.book_id)||null}
function meetingTitle(m){return meetingBook(m)?.title||m?.title||'Livro a definir'}
function meetingBookWasRead(b){return !!b&&(!!b.read_by_club||meetings.some(m=>m.book_id===b.id&&m.starts_at&&!isUpcoming(m)))}
function memberHosted(p){return meetings.some(m=>m.starts_at&&!isUpcoming(m)&&(m.host_participant_id===p.id||m.co_host_participant_id===p.id))}
// Uma integrante deixa de concorrer apenas quando já foi anfitriã PRINCIPAL
// em encontro realizado. A anfitriã convidada não é excluída.
function wasMainHost(p, currentId=null){
 if(!p)return false;
 return meetings.some(m=>m.id!==currentId&&isPastMeeting(m)&&(
  m.host_participant_id===p.id||(!m.host_participant_id&&normalized(m.host||'')===normalized(p.name))
 ));
}
// A anfitriã principal do próprio encontro não concorre nessa rodada.
// A anfitriã convidada não é excluída por este critério.
function isCurrentMainHost(p,meeting){
 if(!p||!meeting)return false;
 if(meeting.host_participant_id)return meeting.host_participant_id===p.id;
 return normalized(meeting.host||'')===normalized(p.name);
}
function drawAvatar(p){
 if(!p)return '<div class="draw-photo draw-photo-empty"><span class="draw-photo-initials">?</span></div>';
 const url=photoUrl(p),initials=safe(initialsFor(p.name));
 return `<div class="draw-photo" role="img" aria-label="Foto de ${safe(p.name)}">${url?`<img src="${safe(url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="draw-photo-initials" hidden>${initials}</span>`:`<span class="draw-photo-initials">${initials}</span>`}</div>`;
}
function setDrawPerson(p,showName=true){
 const photo=$('rollingPhoto'),name=$('rollingName');
 if(!photo||!name)return;
 photo.innerHTML=drawAvatar(p);
 name.textContent=showName?(p?.name||'Quem será?'):'';
 name.hidden=!showName;
}
let celebrationTimer;
function celebrateDraw(){
 const box=$('drawCelebration'),display=$('drawDisplay');if(!box||!display)return;
 clearTimeout(celebrationTimer);
 box.replaceChildren();
 const palette=['#ffd8a6','#fff','#f5b8d2','#d9efcf','#f9e4b9'];
 // Usa animacao de particulas definida por CSS; o elemento fica por cima do resultado.
 for(let i=0;i<52;i++){
  const el=document.createElement('span');el.className='confetti';
  el.style.setProperty('--x',`${Math.cos(i*2.39996)*(90+i%7*16)}px`);
  el.style.setProperty('--y',`${Math.sin(i*2.39996)*(100+i%5*18)}px`);
  el.style.setProperty('--delay',`${i%9*27}ms`);
  el.style.setProperty('--turn',`${i%2?440:-390}deg`);
  el.style.background=palette[i%palette.length];
  box.appendChild(el);
 }
 box.classList.remove('celebrating');
 void box.offsetHeight;
 box.classList.add('celebrating');
 celebrationTimer=setTimeout(()=>{box.classList.remove('celebrating');box.replaceChildren()},3500);
}
function hostsLabel(m){const h=participants.find(p=>p.id===m.host_participant_id)?.name||m.host||'A definir';const co=participants.find(p=>p.id===m.co_host_participant_id)?.name||m.co_host;return co?`${h} e ${co}`:h}
function hostsDetail(m){const h=participants.find(p=>p.id===m.host_participant_id)?.name||m.host||'A definir';const co=participants.find(p=>p.id===m.co_host_participant_id)?.name||m.co_host;return `<p><strong>Anfitriã sorteada:</strong> ${safe(h)}</p>${co?`<p><strong>Anfitriã convidada:</strong> ${safe(co)}</p>`:''}`}
function meetingCard(m,featured=false){const count=attendance.filter(a=>a.meeting_id===m.id&&a.confirmed).length;return `<article class="meeting-card ${featured?'featured':''}">${m.card_url?`<img src="${safe(m.card_url)}" alt="Card de divulgação do encontro" loading="lazy">`:'<div class="placeholder">Card do encontro em breve</div>'}<div class="content"><div class="eyebrow">${featured?'PRÓXIMA LEITURA':'ENCONTRO'}</div><h3>${safe(meetingTitle(m))}</h3><div class="meta">${safe(fmt(m.starts_at))}<br>Anfitriãs: ${safe(hostsLabel(m))}<br>${safe(m.place||'Local a definir')}</div>${featured&&(!m.starts_at||!m.place||!m.card_url)?'<div class="soon">Em breve, mais informações sobre o encontro.</div>':''}<button class="outline" data-open="${safe(m.id)}">Ver detalhes${admin?` · ${count} confirmada(s)`:''}</button></div></article>`}
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
 $('drawMeeting').innerHTML=meetings.map(m=>`<option value="${safe(m.id)}">${safe(meetingTitle(m))} · ${safe(fmt(m.starts_at))}</option>`).join('');
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
 if(m.book_id)return m.book_id;const title=normalized(m.title).replace(/^(a|o) /,'');
 if(!title||title==='livro a definir')return null;
 return books.find(b=>normalized(b.title).replace(/^(a|o) /,'')===title)?.id||null;
}
function bookStatus(b){
 if(!b)return '';
 if(b.id===readingBookId())return '<span class="reading-status" aria-label="Livro em leitura pelo grupo">◉ Em leitura</span>';
 return meetingBookWasRead(b)?'<span class="read-status">✓ Lido pelo grupo</span>':'';
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
   return `<div class="item participant-item member-card ${admin&&!p.active?'member-inactive':''}"><div class="participant-main member-main">
    ${participantAvatar(p)}
    <div class="member-details">
      <strong class="member-name">${safe(p.name)}</strong>${admin&&!p.active?'<span class="inactive-badge">Desativada</span>':''}
      ${b?`<div class="member-book"><div class="member-book-cover">${bookCover(b)}</div><div class="member-book-details"><span class="member-book-title">${safe(b.title)}</span>${b.author?`<span class="member-book-author">${safe(b.author)}</span>`:''}${bookStatus(b)}</div></div>`:'<div class="member-empty">Livro ainda não indicado</div>'}
      ${memberHosted(p)?'<div class="member-hosted">✦ Já foi anfitriã</div>':''}
    </div>
   </div>
   ${admin?`<div class="right member-actions"><button class="outline" data-edit-participant="${safe(p.id)}">Editar</button><button class="quiet" data-photo-person="${safe(p.id)}">${photoUrl(p)?'Trocar foto':'Adicionar foto'}</button>${photoUrl(p)?`<button class="quiet" data-remove-photo="${safe(p.id)}">Remover foto</button>`:''}<button class="quiet" data-active="${safe(p.id)}">${p.active?'Desativar':'Reativar'}</button><button class="danger" data-delete-participant="${safe(p.id)}" aria-label="Excluir ${safe(p.name)}">Excluir</button></div>`:''}</div>`
 }).join(''):'<div class="empty">Nenhuma integrante cadastrada.</div>';

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
function refreshParticipantCoverControls(){
 const id=$('participantId').value;
 const p=participants.find(x=>x.id===id);
 const b=bookForParticipant(p);
 const tools=$('participantCoverTools');tools.hidden=!b;
 $('coverManager').hidden=true;coverBookId=null;
 if(!b)return;
 const url=coverUrl(b);
 $('participantCoverPreview').innerHTML=url?`<img src="${safe(url)}" alt="Capa atual de ${safe(b.title)}" referrerpolicy="no-referrer">`:'<span class="cover-empty-preview">Sem capa</span>';
 const changed=$('participantBook').value.trim()!==b.title||$('participantAuthor').value.trim()!==(b.author||'');
 $('searchCoverInEditor').disabled=changed;
 $('coverEditHint').textContent=changed?'Salve primeiro o novo título e a autoria; depois abra novamente Editar para buscar a capa.':'Você pode pesquisar outra edição ou enviar uma capa aqui.';
}
function participantEditor(p){
 if(!admin)return;
 $('participantEditor').hidden=false;$('participantId').value=p?.id||'';$('participantName').value=p?.name||'';
 const b=bookForParticipant(p);$('participantBook').value=b?.title||'';$('participantAuthor').value=b?.author||'';
 $('participantRead').checked=!!b?.read_by_club;$('participantReadWrap').hidden=!b;
 $('participantFormHeading').textContent=p?'Editar integrante e indicação':'Cadastrar integrante e livro';
 refreshParticipantCoverControls();$('participantEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDetail(id){const m=meetings.find(x=>x.id===id);if(!m)return;currentMeeting=id;const a=attendance.filter(x=>x.meeting_id===id);let detail=`<div class="panel"><div class="meeting-info"><div>${m.card_url?`<img class="meeting-banner" src="${safe(m.card_url)}" alt="Card do encontro">`:'<div class="placeholder">Encontro do Clube</div>'}</div><div><div class="eyebrow">NOSSO ENCONTRO</div><h2>${safe(meetingTitle(m))}</h2><p>${safe(fmt(m.starts_at))}</p><p><strong>Local:</strong> ${safe(m.place||'A definir')}</p>${hostsDetail(m)}<p><strong>Confirmadas:</strong> ${a.filter(x=>x.confirmed).length} · <strong>Presentes:</strong> ${a.filter(x=>x.checked_in).length}</p>${admin?`<button class="outline" data-edit-meeting="${safe(id)}">Editar encontro</button>`:''}</div></div></div>`;
if(admin&&isPastMeeting(m)){
 detail+=`<div class="panel archive-presence"><div class="eyebrow">ENCONTRO ANTERIOR</div><h3>Registro histórico</h3><p class="muted">O check-in está encerrado. Não é necessário cadastrar presenças dos encontros anteriores.</p></div>`;
}else if(admin){
 const confirmed=a.filter(x=>x.confirmed).length, present=a.filter(x=>x.checked_in).length;
 detail+=`<div class="panel attendance-panel">
  <div class="attendance-heading"><div><h3>${attendanceMode==='checkin'?'Check-in do encontro':'Confirmações do encontro'}</h3><p class="muted">${attendanceMode==='checkin'?'Toque na integrante confirmada para registrar a chegada.':'Marque quem confirmou participação antes do encontro.'}</p></div><div class="attendance-count"><strong>${attendanceMode==='checkin'?present:confirmed}</strong><span>${attendanceMode==='checkin'?'presentes':'confirmadas'}</span></div></div>
  <div class="attendance-modes" role="group" aria-label="Etapa de presença">
   <button type="button" class="${attendanceMode==='checkin'?'selected':''}" data-attendance-mode="checkin">Check-in</button>
   <button type="button" class="${attendanceMode==='confirmed'?'selected':''}" data-attendance-mode="confirmed">Confirmações <small>${confirmed}</small></button>
  </div>
  <div class="attendance-tools"><input id="attendanceSearch" type="search" placeholder="Buscar integrante..." aria-label="Buscar integrante" value="${safe(attendanceSearch)}"></div>
  <div class="attendance-summary">${confirmed} confirmadas · ${present} presentes</div>
  ${attendanceMode==='checkin'?`<div class="attendance-bulk"><button type="button" class="outline" data-attendance-bulk="mark">✓ Marcar todas</button><button type="button" class="quiet" data-attendance-bulk="unmark">Desmarcar todas</button></div>`:''}
  <div id="attendanceRows" class="attendance-rows"></div>
 </div>`;
}else{const confirmedPeople=a.filter(x=>x.confirmed).map(x=>participants.find(p=>p.id===x.participant_id)).filter(Boolean);
 const empty=isPastMeeting(m)?'<p class="muted">0 participantes</p>':'<p class="muted">Ainda sem confirmações.</p>';
 detail+=`<div class="panel"><h3>Confirmadas</h3><div class="rows confirmed-people">${confirmedPeople.map(p=>`<div class="public-confirmed">${participantAvatar(p)}<strong>${safe(p.name)}</strong></div>`).join('')||empty}</div></div>`;}
$('meetingDetail').innerHTML=detail;$('meetingDetail').hidden=false;if(admin)renderAttendanceRows();}
function renderAttendanceRows(){
 const root=$('attendanceRows');if(!root||!admin||!currentMeeting||isPastMeeting(meetings.find(m=>m.id===currentMeeting)))return;
 const rows=attendance.filter(a=>a.meeting_id===currentMeeting);
 const queryText=normalized(attendanceSearch);
 let people=participants.filter(p=>p.active||rows.some(r=>r.participant_id===p.id));
 if(queryText)people=people.filter(p=>normalized(p.name).includes(queryText));
 if(attendanceMode==='checkin')people=people.filter(p=>rows.some(r=>r.participant_id===p.id&&r.confirmed));
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
 }).join(''):`<p class="muted">${attendanceMode==='checkin'?'Nenhuma confirmada encontrada. Vá à aba Confirmações para marcar as integrantes.':'Nenhuma integrante encontrada.'}</p>`;
}
// A consulta pública mostra a ESCOLHA PARA O ENCONTRO SEGUINTE,
// não a pessoa como anfitriã do encontro em que o sorteio ocorreu.
function renderPublicDraws(){
 const container=$('publicLatestDraw'),history=$('publicDrawHistory');
 const linked=draws.map(d=>({
  draw:d,source:meetings.find(m=>m.id===d.meeting_id)||null,
  person:participants.find(p=>p.id===d.participant_id)||null,
  book:books.find(b=>b.id===d.book_id)||null,
  next:meetings.find(m=>m.source_draw_id===d.id)||null
 }));
 // Confirmados primeiro; uma tentativa pendente nunca é apresentada como escolha definitiva.
 const accepted=linked.filter(x=>x.draw.status==='accepted').sort((a,b)=>new Date(b.draw.created_at||0)-new Date(a.draw.created_at||0));
 const latest=accepted[0]||null;
 const live=linked.some(x=>x.draw.status==='pending');
 if(!latest){
  container.innerHTML=`<div class="panel public-draw-empty"><div class="eyebrow">NOSSA PRÓXIMA LEITURA</div><h3>Próxima leitura ainda não sorteada</h3><p>${live?'Há um sorteio em andamento, mas o resultado ainda não foi confirmado.':'Quando uma sorteada aceitar, o resultado aparecerá aqui.'}</p></div>`;
 }else{
  const person=latest.person;
  const bookTitle=latest.next?meetingTitle(latest.next):(latest.book?.title||'Livro a indicar');
  const bookAuthor=latest.book?.author||'';
  const sourceLabel=latest.source?`${meetingTitle(latest.source)} · ${fmt(latest.source.starts_at)}`:'Encontro de origem não identificado';
  container.innerHTML=`<div class="public-draw-head"><div class="eyebrow">NOSSA PRÓXIMA LEITURA</div><h2>Uma nova história foi escolhida!</h2></div>
  <div class="public-draw-result">
   <div class="eyebrow">SORTEADA PARA O ENCONTRO SEGUINTE</div>
   ${drawAvatar(person)}
   <h3>${safe(person?.name||'Participante')}</h3>
   <p class="public-draw-book">${safe(bookTitle)}</p>
   ${bookAuthor?`<p class="public-draw-author">${safe(bookAuthor)}</p>`:''}
   <span class="public-draw-confirmation">✓ Sorteio confirmado</span>
  </div>
  <div class="public-draw-origin"><span>Sorteio realizado durante o encontro</span><strong>${safe(sourceLabel)}</strong></div>`;
 }
 // Mantém o histórico REAL de tentativas que estejam persistidas no banco.
 // Não fabrica registros para os encontros anteriores ao site.
 if(!linked.length){history.innerHTML='';return}
 const groups=new Map();
 linked.forEach(x=>{
  const key=x.draw.meeting_id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(x);
 });
 const grouped=Array.from(groups.values()).sort((a,b)=>{
  const da=new Date(a[0].source?.starts_at||a.at(-1).draw.created_at||0);
  const db=new Date(b[0].source?.starts_at||b.at(-1).draw.created_at||0);
  return db-da;
 });
 history.innerHTML=`<details class="public-draw-history"><summary>Histórico de sorteios <span>${groups.size} ${groups.size===1?'encontro':'encontros'}</span></summary>
  <div class="public-draw-history-body">${grouped.map(items=>{
   const m=items[0].source;
   const winner=items.find(x=>x.draw.status==='accepted');
   const title=m?meetingTitle(m):'Encontro não identificado';
   const date=m?fmt(m.starts_at):'Data não informada';
   return `<article class="public-draw-history-item"><div class="public-draw-history-title"><strong>${safe(title)}</strong><span>${safe(date)}</span></div>
    ${winner?`<p><strong>Escolhida para o encontro seguinte:</strong> ${safe(winner.person?.name||'Participante')} · ${safe(winner.next?meetingTitle(winner.next):(winner.book?.title||'Livro a indicar'))}</p>`:'<p><em>Sorteio sem aceite confirmado</em></p>'}
    <details class="public-draw-attempts"><summary>Ver tentativas registradas (${items.length})</summary><div>${items.map(x=>{
     const status=x.draw.status==='accepted'?'Aceitou':x.draw.status==='skipped'?'Não aceitou / novo sorteio':'Aguardando confirmação';
     return `<p><strong>${safe(x.person?.name||'Participante')}</strong> · ${safe(status)}</p>`;
    }).join('')}</div></details>
   </article>`;
  }).join('')}</div></details>`;
}
function renderDraws(){
 $('drawAdminView').hidden=!admin;
 $('drawPublicView').hidden=admin;
 if(!admin){renderPublicDraws();return;}
 const mid=$('drawMeeting').value||meetings[0]?.id;
 const meeting=meetings.find(m=>m.id===mid);
 const d=draws.filter(x=>x.meeting_id===mid);
 const accepted=d.find(x=>x.status==='accepted');
 const last=accepted||d.at(-1);
 const historicWithoutDraws=!!meeting&&isPastMeeting(meeting)&&d.length===0;
 const hostNames=[participants.find(p=>p.id===meeting?.host_participant_id)?.name||meeting?.host,participants.find(p=>p.id===meeting?.co_host_participant_id)?.name||meeting?.co_host].map(n=>String(n||'').trim()).filter(n=>n&&normalized(n)!=='a definir');
 const historyPanel=$('drawHistoryPanel'), historyTitle=$('drawHistoryTitle');
 historyPanel.hidden=historicWithoutDraws&&!hostNames.length;
 $('drawDisplay').hidden=historicWithoutDraws;
 $('drawHistoricalNote').hidden=!historicWithoutDraws;
 historyTitle.textContent=historicWithoutDraws?'Anfitriãs do encontro':'Histórico do sorteio';
 if(historicWithoutDraws){
  $('drawHistory').innerHTML=hostNames.map((name,i)=>`<div class="item historic-host"><div><strong>${safe(name)}</strong><div class="small">${i===0?'Anfitriã':'Anfitriã convidada'}</div></div></div>`).join('');
 }else if(d.length){
  $('drawHistory').innerHTML=d.map(x=>{let p=participants.find(p=>p.id===x.participant_id),b=books.find(b=>b.id===x.book_id);const reason=x.status==='skipped'&&wasMainHost(p,mid)?'Já foi anfitriã principal':x.status==='skipped'?'Não aceitou / novo sorteio':x.status==='accepted'?'✓ Aceitou':'Aguardando resposta';return `<div class="item draw-history-item"><div><strong>${safe(p?.name||'Participante')}</strong><div class="small">${safe(b?.title||'Livro a indicar')}</div></div><span class="badge ${x.status==='accepted'?'yes':''}">${reason}</span></div>`}).join('');
 }else{$('drawHistory').innerHTML='<div class="empty">Sorteio ainda não realizado.</div>'}
 setDrawPerson(last?participants.find(p=>p.id===last.participant_id):null,true);
 $('rollingBook').textContent=last?(books.find(b=>b.id===last.book_id)?.title||'Livro a indicar'):'';
 $('drawDisplay').classList.toggle('accepted',!!accepted);
 $('drawDisplay').classList.remove('drawing');
 $('drawAccepted').hidden=!accepted;
 $('drawBtn').textContent=d.length?'↻ Sortear novamente':'Iniciar sorteio';
 const canDraw=admin&&!isPastMeeting(meeting);
 $('drawBtn').hidden=!canDraw||!!accepted;
 $('acceptBtn').hidden=!(canDraw&&last?.status==='pending'&&!accepted);
 $('resetDraws').hidden=!canDraw||!d.length;
 const excluded=participants.filter(p=>attendance.some(a=>a.meeting_id===mid&&a.checked_in&&a.confirmed&&a.participant_id===p.id)&&(isCurrentMainHost(p,meeting)||wasMainHost(p,mid)));
 $('drawNote').textContent=historicWithoutDraws?'':accepted?'Resultado aceito e registrado para este encontro.':d.length?`${d.filter(x=>x.status==='skipped').length} tentativa(s) anterior(es). A anfitriã principal deste encontro e quem já foi anfitriã principal em encontros anteriores não participam.`:'Participam as integrantes confirmadas e presentes, mesmo sem livro indicado, exceto a anfitriã principal deste encontro e quem já foi anfitriã principal antes. Quem foi apenas anfitriã convidada pode concorrer.';
 const excludedBox=$('drawExcluded');
 if(excludedBox){excludedBox.hidden=historicWithoutDraws||!excluded.length;
  excludedBox.innerHTML=excluded.length?`<strong>Fora do sorteio</strong><div class="draw-exclusion-list">${excluded.map(p=>`<div><strong>${safe(p.name)}</strong> <span>— ${isCurrentMainHost(p,meeting)?'Anfitriã principal deste encontro':'Já foi anfitriã principal'}</span></div>`).join('')}</div>`:'';}
}
async function saveAttendance(person,changes){let m=currentMeeting;if(!m)return;if(isPastMeeting(meetings.find(x=>x.id===m)))throw Error('O check-in de encontros anteriores está encerrado.');let old=attendance.find(x=>x.meeting_id===m&&x.participant_id===person);if(changes.checked_in===true&&!old?.confirmed)throw Error('Somente participantes confirmadas podem fazer check-in.');let row={meeting_id:m,participant_id:person,confirmed:old?.confirmed||false,checked_in:old?.checked_in||false,suggested_book_id:old?.suggested_book_id||participants.find(p=>p.id===person)?.suggested_book_id||null,...changes};if(row.checked_in)row.confirmed=true;if(!row.confirmed)row.checked_in=false;await query(db.from('attendance').upsert(row,{onConflict:'meeting_id,participant_id'}));await load();}
async function bulkCheckIn(mark){
 if(!admin||attendanceSaving||attendanceMode!=='checkin')return;
 const m=meetings.find(x=>x.id===currentMeeting);
 if(!m||isPastMeeting(m))return;
 const rows=attendance.filter(x=>x.meeting_id===m.id&&x.confirmed);
 const updates=rows.filter(x=>!!x.checked_in!==mark).map(x=>({
  meeting_id:m.id,participant_id:x.participant_id,confirmed:true,checked_in:mark,
  suggested_book_id:x.suggested_book_id||participants.find(p=>p.id===x.participant_id)?.suggested_book_id||null
 }));
 if(!updates.length){notify(mark?'Todas as confirmadas já estão presentes.':'Todas as presenças já estão desmarcadas.');return;}
 if(!confirm(mark?`Marcar presença de ${updates.length} integrante(s) confirmada(s)?`:`Desmarcar presença de ${updates.length} integrante(s)?`))return;
 attendanceSaving=true;renderAttendanceRows();
 try{await query(db.from('attendance').upsert(updates,{onConflict:'meeting_id,participant_id'}));await load();}
 catch(err){notify(err.message,true);await load();}
 finally{attendanceSaving=false;renderAttendanceRows();}
}
function meetingEditor(m){
 $('meetingFormPanel').hidden=false;
 $('meetingId').value=m?.id||'';
 const chosen=m?.book_id||books.find(b=>normalized(b.title)===normalized(m?.title||''))?.id||'';
 const bookSelect=$('meetingBook');
 bookSelect.innerHTML='<option value="">Livro a definir · escolher depois</option>'+[...books].sort((a,b)=>a.title.localeCompare(b.title,'pt-BR')).map(b=>`<option value="${safe(b.id)}">${safe(b.title)}${b.author?' — '+safe(b.author):''}</option>`).join('');
 bookSelect.value=chosen;
 if(m?.title&&!chosen&&normalized(m.title)!=='livro a definir'){
   const legacy=document.createElement('option');legacy.value='legacy';legacy.textContent=m.title+' (título antigo — selecione o livro cadastrado)';bookSelect.appendChild(legacy);bookSelect.value='legacy';
 }
 $('meetingDate').value=m?.starts_at?new Date(new Date(m.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 const select=$('meetingHost');
 const savedHost=participants.find(p=>p.id===m?.host_participant_id)?.name||m?.host?.trim()||'';
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
 const savedCoHost=participants.find(p=>p.id===m?.co_host_participant_id)?.name||m?.co_host?.trim()||'';
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
 if(isPastMeeting(meetings.find(m=>m.id===mid)))return notify('Não é possível sortear em um encontro anterior.',true);
 const previous=draws.filter(d=>d.meeting_id===mid);
 if(previous.some(d=>d.status==='accepted'))return notify('Este sorteio já tem resultado confirmado. Para começar de novo, reinicie a rodada.',true);
 // Apenas confirmadas com check-in que nunca foram anfitriãs PRINCIPAIS.
 const current=meetings.find(m=>m.id===mid);
 const eligible=attendance.filter(a=>a.meeting_id===mid&&a.checked_in&&a.confirmed
  &&!previous.some(d=>d.participant_id===a.participant_id)
  &&!isCurrentMainHost(participants.find(p=>p.id===a.participant_id),current)
  &&!wasMainHost(participants.find(p=>p.id===a.participant_id),mid));
 if(!eligible.length)return notify('Não há participantes elegíveis. A anfitriã principal do encontro e quem já foi anfitriã principal não participam; confira os check-ins.',true);
 rolling=true;$('drawBtn').disabled=true;$('acceptBtn').hidden=true;
 $('drawDisplay').classList.remove('accepted');$('drawDisplay').classList.add('drawing');
 $('rollingBook').textContent='';
 const faces=eligible.map(a=>participants.find(p=>p.id===a.participant_id)).filter(Boolean);
 let spinIndex=0;
 const spin=()=>{setDrawPerson(faces[spinIndex%faces.length],false);spinIndex++};
 spin();const interval=setInterval(spin,340);
 try{
  await new Promise(resolve=>setTimeout(resolve,4200));clearInterval(interval);
  const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
  const pick=eligible[bytes[0]%eligible.length];
  const lastPending=previous.filter(d=>d.status==='pending').at(-1);
  if(lastPending)await query(db.from('draws').update({status:'skipped'}).eq('id',lastPending.id));
  await query(db.from('draws').insert({meeting_id:mid,participant_id:pick.participant_id,book_id:pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id||null,status:'pending'}));
  await load();
 }catch(e){clearInterval(interval);notify(e.message,true);await load()}
 finally{rolling=false;$('drawBtn').disabled=false;$('drawDisplay').classList.remove('drawing')}
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
   await query(db.from('meetings').update({title:book.title,book_id:book.id}).eq('id',draft.id));
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
 coverBookId=null;$('coverEditor').hidden=true;$('coverManager').hidden=true;
 await load();refreshParticipantCoverControls();notify('Capa salva! Ela aparecerá para todas as integrantes.');
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
async function initial(){const logo=$('logo');logo.onerror=()=>{logo.hidden=true};$('brandHome').onclick=()=>{switchTab('encontros');$('meetingDetail').hidden=true;$('meetingFormPanel').hidden=true;currentMeeting=null;window.scrollTo({top:0,behavior:'smooth'})};$('setup').hidden=configured;document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('loginToggle').onclick=()=>{$('authPanel').hidden=!$('authPanel').hidden;if(!$('authPanel').hidden)$('authPanel').scrollIntoView({behavior:'smooth'})};$('logout').onclick=async()=>{await db.auth.signOut();admin=false;render()};$('loginForm').onsubmit=async e=>{e.preventDefault();if(!db)return notify('Configure o Supabase primeiro.',true);try{await query(db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await checkAdmin();$('authPanel').hidden=admin;if(!admin)notify('A conta existe, mas não está autorizada como admin.',true);}catch(err){notify('Não foi possível entrar: '+err.message,true)}};
$('searchCoverInEditor').onclick=()=>{const p=participants.find(x=>x.id===$('participantId').value);const b=bookForParticipant(p);if(b)openCoverSearch(b.id)};
 $('closeCoverManager').onclick=()=>{$('coverManager').hidden=true;coverBookId=null};
 $('cancelCover').onclick=()=>{coverBookId=null;$('coverEditor').hidden=true;$('coverManager').hidden=true};
 $('uploadCover').onclick=async()=>{if(coverBusy)return;try{$('uploadCover').disabled=true;await uploadCover()}catch(err){$('coverFeedback').textContent=err.message}finally{$('uploadCover').disabled=false}};
 $('participantBook').addEventListener('input',()=>{$('participantReadWrap').hidden=!$('participantBook').value.trim();refreshParticipantCoverControls()});$('participantAuthor').addEventListener('input',refreshParticipantCoverControls);
 $('newParticipant').onclick=()=>participantEditor(null);$('cancelParticipant').onclick=()=>$('participantEditor').hidden=true;$('newMeeting').onclick=()=>meetingEditor(null);$('cancelMeeting').onclick=()=>$('meetingFormPanel').hidden=true;
$('meetingForm').onsubmit=async e=>{e.preventDefault();try{let old=meetings.find(m=>m.id===$('meetingId').value);let card_url=old?.card_url||'';let file=$('meetingImage').files[0];if(file){if(file.size>5242880)throw Error('O card deve ter até 5 MB.');const ext=file.name.split('.').pop().toLowerCase();const path=`${crypto.randomUUID()}.${ext}`;await query(db.storage.from('meeting-cards').upload(path,file,{contentType:file.type}));card_url=db.storage.from('meeting-cards').getPublicUrl(path).data.publicUrl}const selectedBook=$('meetingBook').value;
 if(selectedBook==='legacy')throw Error('Selecione o livro cadastrado para vincular este encontro.');
 const book=books.find(b=>b.id===selectedBook);
 const host=$('meetingHost').value.trim(), co_host=$('meetingCoHost').value.trim()||null;
 const hostPerson=participants.find(p=>p.name===host), coHostPerson=participants.find(p=>p.name===co_host);
 const row={title:book?.title||'Livro a definir',book_id:book?.id||null,starts_at:$('meetingDate').value?new Date($('meetingDate').value).toISOString():null,place:$('meetingPlace').value.trim(),host,co_host,host_participant_id:hostPerson?.id||null,co_host_participant_id:coHostPerson?.id||null,card_url};if(row.host&&row.co_host&&row.host===row.co_host)throw Error('Escolha duas integrantes diferentes para anfitriãs.');if(old)await query(db.from('meetings').update(row).eq('id',old.id));else await query(db.from('meetings').insert(row));$('meetingFormPanel').hidden=true;await load();notify('Encontro salvo!')}catch(err){notify(err.message,true)}};
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
 if(mode&&admin&&!isPastMeeting(meetings.find(m=>m.id===currentMeeting))){attendanceMode=mode.dataset.attendanceMode;renderDetail(currentMeeting);return}
 const person=e.target.closest('[data-attendance-person]');
 if(!person||!admin||attendanceSaving||isPastMeeting(meetings.find(m=>m.id===currentMeeting)))return;
 const pid=person.dataset.attendancePerson;
 const old=attendance.find(x=>x.meeting_id===currentMeeting&&x.participant_id===pid);
 if(attendanceMode==='checkin'&&!old?.confirmed)return;
 const field=attendanceMode==='checkin'?'checked_in':'confirmed';
 attendanceSaving=true;person.disabled=true;
 try{
  await saveAttendance(pid,{[field]:!old?.[field]});
 }catch(err){notify(err.message,true);await load()}
 finally{attendanceSaving=false;renderAttendanceRows()}
});
document.body.addEventListener('click',e=>{const btn=e.target.closest('[data-attendance-bulk]');if(btn&&admin)bulkCheckIn(btn.dataset.attendanceBulk==='mark');});
document.body.addEventListener('input',e=>{
 if(e.target.id!=='attendanceSearch')return;
 attendanceSearch=e.target.value;renderAttendanceRows();
 const el=$('attendanceSearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}
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
    await query(db.from('meetings').insert({title:book?.title||'Livro a definir',book_id:book?.id||null,host:name,host_participant_id:d.participant_id,co_host:null,co_host_participant_id:null,place:'',card_url:'',starts_at:null,source_draw_id:d.id}));
    draftCreated=true;
   }catch(err){draftError=err;}
  }
  await load();
  if(draftError)notify('Aceite registrado, mas não foi possível criar o rascunho do encontro: '+draftError.message,true);
  else { const notice=$('message'); if(notice)notice.hidden=true; }
  $('drawDisplay').scrollIntoView({behavior:'smooth',block:'center'});
  celebrateDraw();
 }catch(e){notify(e.message,true)}
};
$('resetDraws').onclick=async()=>{if(!admin||rolling)return;if(!confirm('Atenção: reiniciar apaga o histórico de sorteios deste encontro, inclusive resultados confirmados. Deseja continuar?'))return;try{await query(db.from('draws').delete().eq('meeting_id',$('drawMeeting').value));await load()}catch(e){notify(e.message,true)}};
if(db){await checkAdmin();await load()}}
async function checkAdmin(){const {data}=await db.auth.getUser();const user=data?.user;admin=false;if(user){try{const rows=await query(db.from('admins').select('user_id').eq('user_id',user.id));admin=rows.length>0}catch(e){console.warn(e)}}render()}
initial();

// v1.6.2: modal independente de <dialog>, compatível com navegadores móveis.
let photoOpener=null;
function closePhoto(){
 const modal=$('photoModal');if(!modal||modal.hidden)return;
 modal.hidden=true;document.body.classList.remove('photo-open');
 $('photoFull').removeAttribute('src');
 if(photoOpener?.isConnected)photoOpener.focus({preventScroll:true});
 photoOpener=null;
}
function openPhoto(button){
 const person=participants.find(p=>p.id===button.dataset.enlargePhoto);
 if(!person)return;
 const url=photoUrl(person);if(!url)return;
 photoOpener=button;
 $('photoFull').src=url;
 $('photoFull').alt=`Foto de ${person.name}`;
 $('photoFullName').textContent=person.name;
 $('photoModal').hidden=false;
 document.body.classList.add('photo-open');
 $('photoClose').focus({preventScroll:true});
}
// Delegação de eventos: funciona também com imagens carregadas depois pelo Supabase.
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-enlarge-photo]');
 if(button){event.preventDefault();openPhoto(button);return}
 if(event.target.closest?.('#photoClose')||event.target.id==='photoModal'){
  event.preventDefault();closePhoto();
 }
},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePhoto()});
