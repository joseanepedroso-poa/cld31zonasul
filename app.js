/* Clube de Leitura d'Elas — todas as gravações passam pelo RLS do Supabase. */
const $=id=>document.getElementById(id), cfg=window.CLUBE_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabasePublishableKey&&window.supabase);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let admin=false,participants=[],books=[],meetings=[],attendance=[],draws=[],meetingPhotos=[],birthdays=[],currentMeeting=null,rolling=false;
const birthdayToday=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(new Date());
let birthdayViewMonth=Number(birthdayToday);
const birthdayMonthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
let uploadingMeetingPhotos=false;
let discussionQuestions=[],discussionSettings=[],discussionAvailable=true,discussionBusy=false;
let clubActivities=[],activitiesAvailable=true,activityResults={},activityBusy=false,activityPolling=false,activitiesSnapshot='',activityRealtimeChannel=null;
let coverBookId=null,coverBusy=false,coverOptions=[];
let attendanceMode='checkin', attendanceSearch='', attendanceOnlyConfirmed=false, attendanceSaving=false;
let photoTargetId=null,photoSaving=false;
let pendingDeleteMeetingId=null, deletingMeeting=false, adminModalPreviousFocus=null;
let meetingScreen='home', meetingReturnScreen='home', meetingReturnList='home';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x?new Date(x).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}):'Data a definir';
function notify(s,error=false){const el=$('message');el.textContent=s;el.className='notice'+(error?' error':'');el.hidden=false;window.scrollTo({top:0,behavior:'smooth'});}
async function query(p){const {data,error}=await p;if(error)throw error;return data}
async function load(){if(!db)return;try{[participants,books,meetings,attendance,draws,meetingPhotos,birthdays]=await Promise.all([query(db.from('participants').select('*').order('name')),query(db.from('books').select('*').order('title')),query(db.from('meetings').select('*').order('starts_at',{ascending:false})),query(db.from('attendance').select('*')),query(db.from('draws').select('*').order('created_at')),query(db.from('meeting_photos').select('*').order('created_at',{ascending:true})),query(db.from('participant_birthdays').select('*'))]);await loadDiscussion();await loadClubActivities();render();}catch(e){notify('Não foi possível carregar os dados: '+e.message,true)}}
// Compartilha apenas as informações já públicas do encontro, sem envio automático.
function meetingInviteText(m){
 const date=m.starts_at?new Date(m.starts_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'A definir';
 return `Gurias, nosso próximo encontro do Clube de Leitura d’Elas — Grupo 31 Zona Sul! 📚\n\n📖 Livro: ${meetingTitle(m)}${meetingBook(m)?.author?' — '+meetingBook(m).author:''}\n📅 Data e horário: ${date}\n📍 Local: ${m.place||'A definir'}\n👭 Anfitriãs: ${hostsLabel(m)}\n\nMais informações no site do clube:\nhttps://joseanepedroso-poa.github.io/cld31zonasul/`;
}
async function shareMeeting(id){
 if(!admin)return;
 const m=meetings.find(x=>x.id===id);if(!m)return;
 const text=meetingInviteText(m);
 // Abre a conversa do WhatsApp para revisão e envio pela própria participante.
 window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
}
async function loadDiscussion(){
 if(!db)return;
 try{
  [discussionQuestions,discussionSettings]=await Promise.all([
   query(db.from('meeting_discussion_questions').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true})),
   query(db.from('meeting_discussion_settings').select('*'))
  ]);
  discussionAvailable=true;
 }catch(e){
  discussionQuestions=[];discussionSettings=[];discussionAvailable=false;
  console.warn('Seção de perguntas ainda não configurada. Execute migration_v31.sql:',e);
 }
}
function discussionMarkup(m, insideAccordion=false){
 if(!discussionAvailable)return admin?'<div class="panel discussion-panel"><h3>Para conversar sobre o livro</h3><p class="muted">Execute migration_v31.sql no Supabase para habilitar as perguntas.</p></div>':'';
 const published=discussionSettings.some(x=>x.meeting_id===m.id&&x.published);
 if(!admin&&!published)return '';
 const questions=discussionQuestions.filter(q=>q.meeting_id===m.id);
 if(!admin&&!questions.length)return '';
 return `<section class="panel discussion-panel" aria-label="Perguntas para discussão"><div class="discussion-heading"><div>${insideAccordion?'':'<div class="eyebrow">NOSSA CONVERSA LITERÁRIA</div>'}<h3>Para conversar sobre o livro</h3></div>${admin?`<span class="discussion-visibility">${published?'Visível para o grupo':'Rascunho privado'}</span>`:''}</div>
  ${admin?`<label class="discussion-switch"><input type="checkbox" data-discussion-publish="${safe(m.id)}" ${published?'checked':''} ${discussionBusy?'disabled':''}><span>Mostrar perguntas para o grupo</span></label>`:''}
  ${questions.length?`<ol class="discussion-list">${questions.map(q=>`<li><span>${safe(q.question_text)}</span>${admin?`<span class="discussion-item-actions"><button class="outline" type="button" data-discussion-edit="${safe(q.id)}">Editar</button><button class="quiet" type="button" data-discussion-delete="${safe(q.id)}">Excluir</button><span class="discussion-order-controls"><button class="outline discussion-move" type="button" data-discussion-move="${safe(q.id)}" data-direction="up" aria-label="Subir pergunta" title="Subir pergunta" ${questions[0].id===q.id?'disabled':''}>↑</button><button class="outline discussion-move" type="button" data-discussion-move="${safe(q.id)}" data-direction="down" aria-label="Descer pergunta" title="Descer pergunta" ${questions[questions.length-1].id===q.id?'disabled':''}>↓</button></span></span>`:''}</li>`).join('')}</ol>`:'<p class="muted">Nenhuma pergunta cadastrada ainda.</p>'}
  ${admin?`<form class="discussion-form" data-discussion-form="${safe(m.id)}"><label>Nova pergunta ou provocação literária<textarea name="question" rows="2" maxlength="600" placeholder="Que tema ou personagem você gostaria de discutir?" required></textarea></label><button type="submit" class="outline" ${discussionBusy?'disabled':''}>+ Adicionar pergunta</button></form>`:''}</section>`;
}
async function updateDiscussionPublication(meetingId,published){
 if(!admin||discussionBusy)return;
 discussionBusy=true;
 try{
  await query(db.from('meeting_discussion_settings').upsert({meeting_id:meetingId,published},{onConflict:'meeting_id'}));
  await loadDiscussion();discussionBusy=false;renderDetail(meetingId);
 }catch(e){discussionBusy=false;notify('Erro ao alterar a publicação: '+e.message,true);renderDetail(meetingId)}finally{discussionBusy=false;}
}
async function addDiscussionQuestion(meetingId,text){
 if(!admin||discussionBusy||!text.trim())return;
 discussionBusy=true;
 try{
  const order=discussionQuestions.filter(q=>q.meeting_id===meetingId).reduce((max,q)=>Math.max(max,q.sort_order||0),0)+1;
  await query(db.from('meeting_discussion_questions').insert({meeting_id:meetingId,question_text:text.trim(),sort_order:order}));
  await loadDiscussion();discussionBusy=false;renderDetail(meetingId);
 }catch(e){discussionBusy=false;notify('Não foi possível salvar a pergunta: '+e.message,true)}finally{discussionBusy=false;}
}
async function editDiscussionQuestion(id){
 if(!admin||discussionBusy)return;
 const q=discussionQuestions.find(x=>x.id===id);if(!q)return;
 const text=prompt('Editar pergunta para discussão:',q.question_text);
 if(text===null)return;
 if(!text.trim()||text.length>600)return alert('A pergunta precisa ter entre 1 e 600 caracteres.');
 discussionBusy=true;
 try{await query(db.from('meeting_discussion_questions').update({question_text:text.trim()}).eq('id',id));await loadDiscussion();discussionBusy=false;renderDetail(q.meeting_id)}catch(e){discussionBusy=false;notify(e.message,true)}finally{discussionBusy=false}
}
async function deleteDiscussionQuestion(id){
 if(!admin||discussionBusy)return;
 const q=discussionQuestions.find(x=>x.id===id);if(!q||!confirm('Excluir esta pergunta de discussão?'))return;
 discussionBusy=true;
 try{await query(db.from('meeting_discussion_questions').delete().eq('id',id));await loadDiscussion();discussionBusy=false;renderDetail(q.meeting_id)}catch(e){discussionBusy=false;notify(e.message,true)}finally{discussionBusy=false}
}
async function moveDiscussionQuestion(id,direction){
 if(!admin||discussionBusy)return;
 const q=discussionQuestions.find(x=>x.id===id);if(!q)return;
 const ordered=discussionQuestions.filter(x=>x.meeting_id===q.meeting_id);
 const i=ordered.findIndex(x=>x.id===id), j=i+(direction==='up'?-1:1);
 if(i<0||j<0||j>=ordered.length)return;
 // Normaliza posições para evitar empates antigos na ordem do banco.
 const next=[...ordered];[next[i],next[j]]=[next[j],next[i]];
 discussionBusy=true;
 try{
  for(let k=0;k<next.length;k++){
   if(next[k].sort_order!==k+1)await query(db.from('meeting_discussion_questions').update({sort_order:k+1}).eq('id',next[k].id));
  }
  await loadDiscussion();
  discussionBusy=false;renderDetail(q.meeting_id);
 }catch(e){discussionBusy=false;await loadDiscussion();renderDetail(q.meeting_id);notify('Não foi possível reordenar a pergunta: '+e.message,true)}
}
function switchTab(t){document.querySelectorAll('.tab').forEach(el=>el.hidden=el.id!==`tab-${t}`);document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));if(t==='encontros'&&meetingScreen!=='home'){showMeetingScreen('home');}}
function showMeetingScreen(screen,back=null){
 if(back)meetingReturnScreen=back;
 meetingScreen=screen;
 $('meetingsHome').hidden=screen!=='home';
 $('meetingsArchive').hidden=!['past','planned'].includes(screen);
 $('meetingsDetailsScreen').hidden=screen!=='detail';
 $('meetingsEditorScreen').hidden=screen!=='edit';
 if(screen==='home'){$('meetingDetail').hidden=true;currentMeeting=null;}
 if(screen==='past'||screen==='planned')renderMeetingArchive(screen);
}
function meetingNavigate(screen){showMeetingScreen(screen);window.scrollTo({top:0,behavior:'smooth'});}
function meetingArchiveRow(m){
 const hosts=hostsLabel(m);
 const date=m.starts_at?fmt(m.starts_at):'Data a definir';
 return `<button type="button" class="meeting-archive-row" data-open="${safe(m.id)}">${m.card_url?`<img src="${safe(m.card_url)}" alt="" loading="lazy">`:'<span class="meeting-archive-placeholder" aria-hidden="true">📖</span>'}<span class="meeting-archive-text"><strong>${safe(meetingTitle(m))}</strong><small>${safe(date)}</small><small>Anfitriã(s): ${safe(hosts)}</small></span><span class="meeting-archive-chevron" aria-hidden="true">›</span></button>`;
}
function renderMeetingArchive(screen){
 const future=meetings.filter(isUpcoming).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const unscheduled=meetings.filter(m=>!m.starts_at).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const featured=future[0]||unscheduled[0]||null;
 const items=screen==='past'?meetings.filter(isPastMeeting).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at)):[...future.filter(m=>m.id!==featured?.id),...unscheduled.filter(m=>m.id!==featured?.id)];
 $('meetingsArchiveTitle').textContent=screen==='past'?'Encontros anteriores':'Outros encontros planejados';
 $('meetingsArchiveList').innerHTML=items.length?items.map(meetingArchiveRow).join(''):'<div class="empty">Nenhum encontro nesta lista.</div>';
}
function openMeetingScreen(id){
 meetingReturnList=['past','planned'].includes(meetingScreen)?meetingScreen:'home';
 renderDetail(id);showMeetingScreen('detail');refreshActivityResults();window.scrollTo({top:0,behavior:'smooth'});
}

function render(){document.body.classList.toggle('is-admin',admin);if(!admin){document.querySelectorAll('[data-share-meeting]').forEach(b=>b.remove());}if(!admin&&$('coverManager')){$('coverManager').hidden=true;coverBookId=null;}document.querySelectorAll('.admin-only').forEach(el=>{if(!['meetingFormPanel','participantEditor','authPanel','coverManager'].includes(el.id))el.hidden=!admin});$('adminIndicator').hidden=!admin;$('loginToggle').setAttribute('aria-label',admin?'Abrir opções administrativas':'Entrar como administrador');$('loginToggle').title=admin?'Opções administrativas':'Entrar como administrador';$('adminSession').hidden=!admin;$('loginForm').hidden=admin;renderMeetings();renderParticipants();renderDraws();if(currentMeeting)renderDetail(currentMeeting);}
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
function mainHostParticipant(meeting){
 if(!meeting)return null;
 if(meeting.host_participant_id){
  return participants.find(p=>p.id===meeting.host_participant_id)||null;
 }
 const label=normalized(meeting.host||'');
 if(!label||label==='a definir')return null;
 const exact=participants.filter(p=>normalized(p.name)===label);
 if(exact.length===1)return exact[0];
 // Apelidos conhecidos do Grupo 31: só usar se a correspondência for única.
 if(['ali','ale'].includes(label)){
  const candidates=participants.filter(p=>normalized(p.name).split(' ')[0]==='alessandra');
  if(candidates.length===1)return candidates[0];
 }
 return null;
}
function isCurrentMainHost(p,meeting){
 if(!p||!meeting)return false;
 return mainHostParticipant(meeting)?.id===p.id;
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
function meetingCard(m,featured=false){const count=attendance.filter(a=>a.meeting_id===m.id&&a.confirmed).length;return `<article class="meeting-card ${featured?'featured':''}">${m.card_url?`<img src="${safe(m.card_url)}" alt="Card de divulgação do encontro" loading="lazy">`:'<div class="placeholder">Card do encontro em breve</div>'}<div class="content"><div class="eyebrow">${featured?'PRÓXIMA LEITURA':'ENCONTRO'}</div><div class="meeting-title-share"><h3>${safe(meetingTitle(m))}</h3>${featured&&admin?`<button type="button" class="invite-button admin-invite-only" data-share-meeting="${safe(m.id)}" aria-label="Compartilhar convite no WhatsApp" title="Compartilhar convite no WhatsApp"><svg class="whatsapp-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.7a8 8 0 0 1-11.7 7.1L4 20l1.2-4.3A8 8 0 1 1 20 11.7Z" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/><path d="M9 8.1c-.3-.6-.5-.6-.8-.6-.3 0-.7.1-1 .5-.4.5-.6 1-.4 1.8.4 1.6 2.2 3.4 3.7 4.2 1.4.7 2.4.8 3 .5.5-.2 1-.8 1.1-1.3 0-.2-.1-.3-.4-.5l-1.6-.8c-.3-.1-.4 0-.6.2l-.6.7c-.2.2-.4.2-.7.1-.7-.3-1.6-1-2.1-1.6-.2-.2-.2-.4 0-.6l.5-.6c.2-.2.2-.4.1-.6Z" fill="currentColor"/></svg></button>`:''}</div><div class="meta">${safe(fmt(m.starts_at))}<br>Anfitriãs: ${safe(hostsLabel(m))}<br>${safe(m.place||'Local a definir')}</div>${featured&&(!m.starts_at||!m.place||!m.card_url)?'<div class="soon">Em breve, mais informações sobre o encontro.</div>':''}<button class="outline ${featured?'featured-details-button':''}" data-open="${safe(m.id)}">${featured?'Saiba mais sobre o encontro <span class="featured-details-arrow" aria-hidden="true">→</span>':'Ver detalhes'}</button></div></article>`}
function renderMeetings(){
 const selectedMeeting=$('drawMeeting').value;
 const future=meetings.filter(isUpcoming).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const unscheduled=meetings.filter(m=>!m.starts_at).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const featured=future[0]||unscheduled[0]||null;
 const previous=meetings.filter(isPastMeeting).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));
 const planned=[...future.filter(m=>m.id!==featured?.id),...unscheduled.filter(m=>m.id!==featured?.id)];
 $('meetingCards').innerHTML=featured?meetingCard(featured,true):'<div class="empty"><strong>Próximo encontro em preparação</strong><p>Assim que o livro ou a anfitriã forem cadastrados, as informações aparecerão aqui.</p></div>';
 $('pastMeetings').innerHTML=`${planned.length?`<button type="button" class="meeting-list-link" data-meeting-go="planned"><span><strong>Outros encontros planejados</strong><small>${planned.length} ${planned.length===1?'encontro':'encontros'}</small></span><span aria-hidden="true">›</span></button>`:''}<button type="button" class="meeting-list-link" data-meeting-go="past"><span><strong>Encontros anteriores</strong><small>${previous.length} ${previous.length===1?'encontro registrado':'encontros registrados'}</small></span><span aria-hidden="true">›</span></button>`;
 if(meetingScreen==='past'||meetingScreen==='planned')renderMeetingArchive(meetingScreen);
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
function birthdayForParticipant(id){return birthdays.find(b=>b.participant_id===id)||null}
function renderBirthdayMonth(){
 const root=$('birthdayMonth');if(!root)return;
 const items=birthdays.filter(b=>b.show_public&&Number(b.birth_month)===birthdayViewMonth)
  .map(b=>({birthday:b,participant:participants.find(p=>p.id===b.participant_id)}))
  .filter(item=>item.participant?.active)
  .sort((a,b)=>Number(a.birthday.birth_day)-Number(b.birthday.birth_day)||a.participant.name.localeCompare(b.participant.name,'pt-BR'));
 const month=birthdayMonthNames[birthdayViewMonth-1];
 root.innerHTML=`<div class="birthday-header"><div><div class="eyebrow">DATAS PARA CELEBRAR</div><h3><svg class="birthday-heading-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M11 24c-1.3-2.2-5-5.5-5-11a8 8 0 0 1 16 0c0 5.5-3.7 8.8-5 11Z" fill="#da8eaa"/><path d="M24 19c-1.2-2.1-4-4.6-4-9.1a6.5 6.5 0 0 1 13 0c0 4.5-2.8 7-4 9.1Z" fill="#dcb46e"/><path d="m14 25-1 3 3-1-2-2Zm12-5-1 3 3-1-2-2Z" fill="#99667c"/><path d="M14 28c4 4-2 6 3 10M26 23c-4 6 2 8-2 15" fill="none" stroke="#9c7889" stroke-width="1.35" stroke-linecap="round"/><circle cx="34" cy="23" r="1.5" fill="#b895c6"/><circle cx="6" cy="29" r="1.3" fill="#d1a563"/><path d="m34 30 2 2m-2 0 2-2" stroke="#ca8ca1" stroke-width="1.3" stroke-linecap="round"/></svg><span>Aniversariantes de ${safe(month)}</span></h3></div><div class="birthday-month-nav"><button type="button" data-birthday-change="-1" aria-label="Mês anterior" title="Mês anterior">‹</button><button type="button" data-birthday-change="1" aria-label="Próximo mês" title="Próximo mês">›</button></div></div>
 ${items.length?`<div class="birthday-list">${items.map(({participant:p,birthday:b})=>`<div class="birthday-person">${participantAvatar(p)}<div class="birthday-person-caption"><strong>${safe(p.name)}</strong><span>${String(b.birth_day).padStart(2,'0')} de ${safe(month)}</span></div></div>`).join('')}</div>`:'<p class="muted birthday-empty">Nenhuma aniversariante com data divulgada neste mês.</p>'}`;
}
function renderParticipants(){
 renderBirthdayMonth();
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
 const birthday=p?birthdayForParticipant(p.id):null;
 $('participantBirthdayDay').value=birthday?.birth_day||'';
 $('participantBirthdayMonth').value=birthday?.birth_month||'';
 $('participantBirthdayPublic').checked=!!birthday?.show_public;
 const b=bookForParticipant(p);$('participantBook').value=b?.title||'';$('participantAuthor').value=b?.author||'';
 $('participantRead').checked=!!b?.read_by_club;$('participantReadWrap').hidden=!b;
 $('participantFormHeading').textContent=p?'Editar integrante e indicação':'Cadastrar integrante e livro';
 refreshParticipantCoverControls();$('participantEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
// Galeria: os arquivos otimizados ficam em Storage; no banco guardamos apenas metadados.
function meetingPhotoUrl(item){return db.storage.from('meeting-gallery').getPublicUrl(item.storage_path).data.publicUrl}
function galleryMarkup(mid){
 const images=meetingPhotos.filter(x=>x.meeting_id===mid);
 return `<section class="panel meeting-gallery"><div class="gallery-heading"><div><div class="eyebrow">MOMENTOS DO NOSSO ENCONTRO</div><h3>Fotos do encontro</h3></div>${images.length?`<span class="gallery-count">${images.length} foto${images.length===1?'':'s'}</span>`:''}</div>
 ${images.length?`<div class="gallery-grid">${images.map((item,i)=>`<div class="gallery-item"><button type="button" class="gallery-photo" data-open-gallery="${safe(item.id)}" aria-label="Ampliar foto ${i+1} do encontro"><img src="${safe(meetingPhotoUrl(item))}" alt="Foto ${i+1} do encontro" loading="lazy" decoding="async"></button>${admin?`<button type="button" class="gallery-delete" data-delete-gallery="${safe(item.id)}" aria-label="Excluir foto ${i+1}">×</button>`:''}</div>`).join('')}</div>`:'<p class="muted gallery-empty">As fotos deste encontro aparecerão aqui.</p>'}
 ${admin?`<div class="gallery-upload"><label for="galleryUpload">Adicionar fotos do encontro</label><input type="file" id="galleryUpload" accept="image/jpeg,image/png,image/webp" multiple><p class="muted">Até 10 fotos por vez. O site reduz automaticamente as imagens antes de enviar. Apenas a administração pode adicionar ou excluir.</p><button type="button" class="outline" id="galleryUploadButton" ${uploadingMeetingPhotos?'disabled':''}>${uploadingMeetingPhotos?'Enviando fotos...':'Enviar fotos selecionadas'}</button><p id="galleryUploadStatus" role="status" class="muted" aria-live="polite"></p></div>`:''}</section>`;
}
async function optimizedMeetingPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use fotos JPG, PNG ou WebP.');
 if(file.size>20*1024*1024)throw Error('A foto original deve ter até 20 MB.');
 const bitmap=await createImageBitmap(file);
 try{
  const width=bitmap.width,height=bitmap.height;
  if(!width||!height)throw Error('Imagem inválida.');
  const scale=Math.min(1,1600/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a foto.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.79));
  if(!blob)throw Error('Não foi possível comprimir a foto.');
  if(blob.size>4*1024*1024)throw Error('A foto ficou muito grande mesmo após compressão.');
  return blob;
 }finally{bitmap.close();}
}
async function uploadMeetingGallery(){
 if(!admin||!currentMeeting||uploadingMeetingPhotos)return;
 const input=$('galleryUpload');const files=[...(input?.files||[])];
 if(!files.length){notify('Selecione uma ou mais fotos.',true);return;}
 if(files.length>10){notify('Selecione até 10 fotos por envio.',true);return;}
 uploadingMeetingPhotos=true;
 const button=$('galleryUploadButton'),status=$('galleryUploadStatus');
 if(button){button.disabled=true;button.textContent='Enviando fotos...';}
 let saved=0;
 try{
  for(const file of files){
   if(status)status.textContent=`Preparando foto ${saved+1} de ${files.length}...`;
   const optimized=await optimizedMeetingPhoto(file);
   const path=`${currentMeeting}/${crypto.randomUUID()}.jpg`;
   await query(db.storage.from('meeting-gallery').upload(path,optimized,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'}));
   try{await query(db.from('meeting_photos').insert({meeting_id:currentMeeting,storage_path:path}));}
   catch(err){await db.storage.from('meeting-gallery').remove([path]);throw err;}
   saved++;
  }
  await load();
  if(currentMeeting){renderDetail(currentMeeting);}
  const latest=$('galleryUploadStatus');if(latest)latest.textContent=`${saved} foto${saved===1?' enviada':'s enviadas'} com sucesso.`;
 }catch(err){if(saved)await load();notify(`${saved} foto(s) salva(s). Não foi possível concluir: ${err.message}`,true);}
 finally{uploadingMeetingPhotos=false;const b=$('galleryUploadButton');if(b){b.disabled=false;b.textContent='Enviar fotos selecionadas';}}
}
async function deleteMeetingGallery(id){
 if(!admin)return;
 const item=meetingPhotos.find(x=>x.id===id);if(!item)return;
 if(!confirm('Excluir esta foto do encontro? Essa ação não pode ser desfeita.'))return;
 try{
  await query(db.from('meeting_photos').delete().eq('id',id));
  const {error}=await db.storage.from('meeting-gallery').remove([item.storage_path]);
  if(error)console.warn('Não foi possível limpar o arquivo antigo:',error.message);
  await load();
 }catch(err){notify('Não foi possível excluir a foto: '+err.message,true);}
}
function openGalleryPhoto(id){
 const item=meetingPhotos.find(x=>x.id===id);if(!item)return;
 const modal=$('galleryModal');$('galleryFullImage').src=meetingPhotoUrl(item);
 $('galleryFullImage').alt='Foto ampliada do encontro';modal.hidden=false;document.body.classList.add('gallery-modal-open');
 $('galleryClose').focus({preventScroll:true});
}
function closeGalleryPhoto(){const modal=$('galleryModal');if(modal.hidden)return;modal.hidden=true;$('galleryFullImage').removeAttribute('src');document.body.classList.remove('gallery-modal-open');}
// Mantém o estado aberto/fechado quando o conteúdo é atualizado (check-in, perguntas, fotos).
function meetingSectionState(meetingId){
 const state={};
 document.querySelectorAll('#meetingDetail details[data-meeting-section]').forEach(el=>{
  if(el.dataset.meetingId===meetingId)state[el.dataset.meetingSection]=el.open;
 });
 return state;
}
function meetingSectionIcon(key){
 const icons={
  confirmed:`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8 1.3a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM2.8 18.7c.6-2.6 2.7-4.1 5.2-4.1s4.6 1.5 5.2 4.1M12.9 18.7c.4-1.9 2-3.1 4-3.1 1.8 0 3.3.9 4.1 3.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  discussion:`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 17.5V6.8c0-1 .8-1.8 1.8-1.8h10.4c1 0 1.8.8 1.8 1.8v7.4c0 1-.8 1.8-1.8 1.8H10l-3.6 2.7c-.5.3-1.4 0-1.4-.7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.6 9.2h6.8M8.6 12.2h4.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  activities:`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V12m5 7V6m5 13v-9m5 9V4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M2.5 21h19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  photos:`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.7 7.2h3l1.1-1.7h6.4l1.1 1.7h3c1 0 1.8.8 1.8 1.8v8.5c0 1-.8 1.8-1.8 1.8H4.7c-1 0-1.8-.8-1.8-1.8V9c0-1 .8-1.8 1.8-1.8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`
 };
 return icons[key]||'';
}
function meetingAccordion(meetingId,key,title,content,expanded){
 const open=expanded?' open':'';
 const icon=meetingSectionIcon(key);
 return `<details class="meeting-collapse" data-meeting-id="${safe(meetingId)}" data-meeting-section="${safe(key)}"${open}><summary><span class="meeting-collapse-title"><span class="meeting-collapse-icon" aria-hidden="true">${icon}</span><span>${safe(title)}</span></span><span class="meeting-collapse-chevron" aria-hidden="true"></span></summary><div class="meeting-collapse-content">${content}</div></details>`;
}
// v3.3 — Roda Literária: rascunhos, publicação imediata e resultados ao vivo.
const activityKey=id=>'clube31_vote_'+id;
function voterToken(){
 try{let token=localStorage.getItem('clube31_voter_token');if(!token){token=crypto.randomUUID();localStorage.setItem('clube31_voter_token',token);}return token;}
 catch(_){if(!window.__clubVoterToken)window.__clubVoterToken=crypto.randomUUID();return window.__clubVoterToken;}
}
function votedLocally(id){try{return localStorage.getItem(activityKey(id))==='1';}catch(_){return !!window['voted_'+id];}}
function markVoted(id){try{localStorage.setItem(activityKey(id),'1');}catch(_){window['voted_'+id]=true;}}
async function loadClubActivities(){
 if(!db)return;
 try{clubActivities=await query(db.from('club_activities').select('id,meeting_id,question,activity_type,options,status,created_at,updated_at').order('created_at',{ascending:true}));activitiesAvailable=true;}
 catch(err){clubActivities=[];activitiesAvailable=false;console.warn('Execute migration_v33.sql para habilitar a Roda Literária:',err);}
}
function activitiesForMeeting(id){return clubActivities.filter(x=>x.meeting_id===id).sort((a,b)=>((a.status==='live'?0:a.status==='closed'?1:2)-(b.status==='live'?0:b.status==='closed'?1:2))||new Date(b.created_at)-new Date(a.created_at));}
function activityTypeLabel(type){return type==='cloud'?'Nuvem de palavras':'Múltipla escolha';}
function activityResultsMarkup(a){
 return `<div class="activity-results" data-activity-results="${safe(a.id)}"><p class="muted">Carregando resultados...</p></div>`;
}
function activityCard(a){
 const answered=votedLocally(a.id),live=a.status==='live';
 const options=Array.isArray(a.options)?a.options:[];
 const canVote=live&&!answered;
 const choiceFields=a.activity_type==='choice'?`<fieldset class="activity-choices"><legend class="sr-only">Escolha uma resposta</legend>${options.map((opt,i)=>`<label class="activity-choice"><input type="radio" name="answer" value="${safe(opt)}" ${i===0?'required':''}><span>${safe(opt)}</span></label>`).join('')}</fieldset>`:`<label class="activity-word-label">Sua palavra ou expressão curta<input name="answer" type="text" maxlength="45" required autocomplete="off" placeholder="Escreva aqui..."></label>`;
 return `<article class="live-activity" data-activity-id="${safe(a.id)}"><div class="activity-topline"><span class="activity-type">${activityTypeLabel(a.activity_type)}</span><span class="activity-status ${a.status}">${a.status==='live'?'● Ao vivo':a.status==='draft'?'Rascunho':'Encerrada'}</span></div><h3 class="activity-question">${safe(a.question)}</h3>
 ${admin?`<div class="activity-admin-actions">${a.status==='draft'?`<button type="button" class="outline" data-activity-open="${safe(a.id)}">Publicar agora</button>`:''}${live?`<button type="button" class="outline" data-activity-close="${safe(a.id)}">Encerrar</button>`:''}<button type="button" class="quiet" data-activity-delete="${safe(a.id)}">Excluir</button></div>`:''}
 ${canVote?`<form class="activity-vote-form" data-activity-vote="${safe(a.id)}">${choiceFields}<button type="submit">Enviar resposta</button></form>`:''}
 ${live&&answered?'<p class="activity-answered">✓ Você já respondeu a esta dinâmica neste navegador.</p>':''}
 ${a.status!=='draft'?`<div class="activity-projection-content"><div class="activity-results-heading"><strong>Resultados ${live?'ao vivo':'finais'}</strong><button type="button" class="quiet activity-project-button" data-activity-project="${safe(a.id)}" aria-label="Exibir resultados em tela cheia">⛶ Tela cheia</button></div>${activityResultsMarkup(a)}</div>`:''}</article>`;
}
function activitiesMarkup(m){
 if(!activitiesAvailable)return admin?'<div class="panel"><p class="muted">Execute migration_v33.sql no Supabase para habilitar a Roda Literária.</p></div>':'';
 const items=activitiesForMeeting(m.id);
 if(!admin&&!items.length)return '';
 const live=items.find(a=>a.status==='live');
 const form=admin&&!isPastMeeting(m)?`<details class="activity-editor"><summary>+ Criar dinâmica</summary><form data-activity-create="${safe(m.id)}" class="activity-new-form"><label>Tipo de dinâmica<select name="type" data-activity-type><option value="choice">Múltipla escolha</option><option value="cloud">Nuvem de palavras</option></select></label><label>Pergunta<textarea name="question" rows="2" maxlength="240" required placeholder="Qual personagem mais te marcou?"></textarea></label><label data-activity-options>Alternativas — uma por linha<textarea name="options" rows="4" maxlength="500" placeholder="Personagem A&#10;Personagem B&#10;Personagem C"></textarea></label><div class="activity-form-actions"><button type="submit" class="outline" value="draft" name="publish">Salvar rascunho</button><button type="submit" value="live" name="publish">Publicar agora</button></div><p class="muted">Só uma dinâmica pode ficar aberta por encontro. Encerre a atual antes de publicar outra.</p></form></details>`:'';
 return `<section class="activity-section">${admin?`<p class="muted activity-help">Crie pelo celular, deixe em rascunho ou publique na hora. Os resultados aparecem automaticamente para o grupo.</p>`:''}${live?'':admin?'':'<p class="muted">Dinâmicas encerradas deste encontro.</p>'}${form}<div class="activity-cards">${items.map(activityCard).join('')}</div></section>`;
}
async function refreshActivityResults(){
 if(!db||activityPolling||document.hidden||!currentMeeting||meetingScreen!=='detail')return;
 activityPolling=true;
 try{
  // Consulta a lista pública/administrativa para detectar publicação ou encerramento.
  const latest=await query(db.from('club_activities').select('id,meeting_id,question,activity_type,options,status,created_at,updated_at').eq('meeting_id',currentMeeting).order('created_at',{ascending:true}));
  const old=clubActivities.filter(x=>x.meeting_id!==currentMeeting);
  const oldSignature=JSON.stringify(clubActivities.filter(x=>x.meeting_id===currentMeeting).map(x=>[x.id,x.status,x.question,x.options]));
  const newSignature=JSON.stringify(latest.map(x=>[x.id,x.status,x.question,x.options]));
  if(oldSignature!==newSignature){
    clubActivities=[...old,...latest];
    const currentOpen=document.querySelector('#meetingDetail details[data-meeting-section="activities"]')?.open;
    renderDetail(currentMeeting);
    const section=document.querySelector('#meetingDetail details[data-meeting-section="activities"]');if(section&&currentOpen!==undefined)section.open=currentOpen;
  }
  const ids=latest.filter(x=>x.status!=='draft').map(x=>x.id);
  await Promise.all(ids.map(async id=>{
    try{const data=await query(db.rpc('club_activity_results',{p_activity_id:id}));activityResults[id]=data;paintActivityResults(id,data);}catch(err){console.warn('Resultado indisponível:',err.message);}
  }));
 }catch(err){console.warn('Atualização da Roda Literária:',err.message)}
 finally{activityPolling=false;}
}
function paintActivityResults(id,data){
 const el=document.querySelector(`[data-activity-results="${id}"]`);if(!el||!data)return;
 const item=clubActivities.find(x=>x.id===id);if(!item)return;
 const total=Number(data.total)||0, counts=data.counts||{};
 let html=`<p class="activity-response-count"><strong>${total}</strong> resposta${total===1?'':'s'}</p>`;
 if(item.activity_type==='choice'){
  const options=Array.isArray(item.options)?item.options:[];
  html+=`<div class="activity-bars">${options.map((opt,i)=>{const count=Number(counts[opt])||0,pct=total?Math.round(count/total*100):0;return `<div class="activity-bar-item"><div class="activity-bar-label"><span>${safe(opt)}</span><strong>${count} · ${pct}%</strong></div><div class="activity-bar-track"><div class="activity-bar-fill" style="width:${pct}%;--bar-index:${i}"></div></div></div>`}).join('')}</div>`;
 }else{
  const values=Object.entries(counts).map(([word,count])=>({word,count:Number(count)})).sort((a,b)=>b.count-a.count).slice(0,45);
  const highest=Math.max(1,...values.map(x=>x.count));
  html+=values.length?`<div class="activity-cloud" aria-label="Nuvem de palavras">${values.map((v,i)=>`<span class="activity-cloud-word" style="font-size:${(1+v.count/highest*1.3).toFixed(2)}rem;--word-index:${i%4}" title="${v.count} resposta(s)">${safe(v.word)}</span>`).join('')}</div>`:'<p class="muted">As palavras aparecerão aqui conforme forem enviadas.</p>';
 }
 // Atualiza os valores sem mexer no formulário onde alguém está digitando.
 if(el.dataset.rendered!==html){el.innerHTML=html;el.dataset.rendered=html;}
}
async function createActivity(form,action){
 if(!admin||activityBusy)return;
 const meetingId=form.dataset.activityCreate, type=form.elements.type.value;
 const question=form.elements.question.value.trim();
 let options=type==='choice'?form.elements.options.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[];
 if(!question||question.length>240)return alert('Informe a pergunta (até 240 caracteres).');
 if(type==='choice'&&(options.length<2||options.length>8||new Set(options.map(x=>x.toLowerCase())).size!==options.length))return alert('Informe de 2 a 8 alternativas diferentes, uma por linha.');
 if(options.some(x=>x.length>100))return alert('Cada alternativa deve ter no máximo 100 caracteres.');
 if(action==='live'&&activitiesForMeeting(meetingId).some(x=>x.status==='live'))return alert('Encerre a dinâmica que está ao vivo antes de publicar outra.');
 activityBusy=true;
 try{await query(db.from('club_activities').insert({meeting_id:meetingId,question,activity_type:type,options,status:action==='live'?'live':'draft'}));await loadClubActivities();renderDetail(meetingId);await refreshActivityResults();}
 catch(err){alert('Não foi possível salvar a dinâmica: '+err.message)}finally{activityBusy=false;}
}
async function updateActivityStatus(id,status){
 if(!admin||activityBusy)return;
 const a=clubActivities.find(x=>x.id===id);if(!a)return;
 if(status==='live'&&activitiesForMeeting(a.meeting_id).some(x=>x.status==='live'&&x.id!==id))return alert('Encerre a dinâmica atual antes de publicar outra.');
 if(status==='closed'&&!confirm('Encerrar esta dinâmica? As respostas ficarão no histórico.'))return;
 activityBusy=true;
 try{await query(db.from('club_activities').update({status}).eq('id',id));await loadClubActivities();renderDetail(a.meeting_id);await refreshActivityResults();}
 catch(err){alert('Não foi possível alterar a dinâmica: '+err.message)}finally{activityBusy=false;}
}
async function deleteActivity(id){
 if(!admin||activityBusy)return;
 const a=clubActivities.find(x=>x.id===id);if(!a||!confirm(`Excluir definitivamente esta dinâmica e todas as respostas?\n\n${a.question}`))return;
 activityBusy=true;
 try{await query(db.from('club_activities').delete().eq('id',id));delete activityResults[id];await loadClubActivities();renderDetail(a.meeting_id);}
 catch(err){alert('Não foi possível excluir: '+err.message)}finally{activityBusy=false;}
}
async function voteActivity(form){
 if(activityBusy)return;
 const id=form.dataset.activityVote;
 if(votedLocally(id))return alert('Este navegador já respondeu a esta dinâmica.');
 const data=new FormData(form),answer=String(data.get('answer')||'').trim();if(!answer)return alert('Escolha ou escreva uma resposta.');
 const button=form.querySelector('[type=submit]');button.disabled=true;
 try{await query(db.rpc('club_activity_vote',{p_activity_id:id,p_voter_token:voterToken(),p_answer:answer}));markVoted(id);if(currentMeeting)renderDetail(currentMeeting);await refreshActivityResults();}
 catch(err){if(/duplicate|unique|já respondeu|already/i.test(err.message)){markVoted(id);if(currentMeeting)renderDetail(currentMeeting);}else alert('Não foi possível enviar a resposta: '+err.message)}
 finally{if(button.isConnected)button.disabled=false;}
}
function toggleActivityProjection(id){
 const card=document.querySelector(`[data-activity-id="${id}"]`);if(!card)return;
 if(card.classList.contains('activity-projected')){card.classList.remove('activity-projected');document.body.classList.remove('activity-projection-open');return;}
 document.querySelectorAll('.activity-projected').forEach(el=>el.classList.remove('activity-projected'));
 card.classList.add('activity-projected');document.body.classList.add('activity-projection-open');
}
function startActivityUpdates(){
 if(!db)return;
 if(!window.__clubActivityRefresh){window.__clubActivityRefresh=setInterval(()=>{if(activitiesAvailable)refreshActivityResults()},3000);}
 if(!activityRealtimeChannel){
  activityRealtimeChannel=db.channel('club-activities-live').on('postgres_changes',{event:'*',schema:'public',table:'club_activities'},()=>{if(meetingScreen==='detail')refreshActivityResults();}).subscribe();
 }
}
document.body.addEventListener('change',e=>{if(e.target.matches('[data-activity-type]')){const form=e.target.closest('form');const options=form?.querySelector('[data-activity-options]');if(options)options.hidden=e.target.value==='cloud';}});
document.body.addEventListener('submit',e=>{
 const create=e.target.closest('[data-activity-create]');if(create){e.preventDefault();createActivity(create,e.submitter?.value==='live'?'live':'draft');return;}
 const vote=e.target.closest('[data-activity-vote]');if(vote){e.preventDefault();voteActivity(vote);}
});
document.body.addEventListener('click',e=>{
 const open=e.target.closest('[data-activity-open]'),close=e.target.closest('[data-activity-close]'),del=e.target.closest('[data-activity-delete]'),project=e.target.closest('[data-activity-project]');
 if(open)updateActivityStatus(open.dataset.activityOpen,'live');
 else if(close)updateActivityStatus(close.dataset.activityClose,'closed');
 else if(del)deleteActivity(del.dataset.activityDelete);
 else if(project)toggleActivityProjection(project.dataset.activityProject);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.activity-projected').forEach(el=>el.classList.remove('activity-projected'));document.body.classList.remove('activity-projection-open');}});

function renderDetail(id){
 const m=meetings.find(x=>x.id===id);if(!m)return;
 const savedSections=meetingSectionState(id);
 currentMeeting=id;
 const a=attendance.filter(x=>x.meeting_id===id);
 const historical=isPastMeeting(m);
 const isFeatured=featuredMeeting()?.id===id;
 const confirmedCount=a.filter(x=>x.confirmed).length;
 const presentCount=a.filter(x=>x.checked_in).length;
 let detail=`<div class="panel"><div class="meeting-info"><div>${m.card_url?`<img class="meeting-banner" src="${safe(m.card_url)}" alt="Card do encontro">`:'<div class="placeholder">Encontro do Clube</div>'}</div><div><div class="eyebrow">NOSSO ENCONTRO</div><h2>${safe(meetingTitle(m))}</h2><p>${safe(fmt(m.starts_at))}</p><p><strong>Local:</strong> ${safe(m.place||'A definir')}</p>${hostsDetail(m)}${!historical&&admin?`<button type="button" class="invite-button admin-invite-only" data-share-meeting="${safe(id)}" aria-label="Compartilhar convite no WhatsApp" title="Compartilhar convite no WhatsApp"><svg class="whatsapp-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.7a8 8 0 0 1-11.7 7.1L4 20l1.2-4.3A8 8 0 1 1 20 11.7Z" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/><path d="M9 8.1c-.3-.6-.5-.6-.8-.6-.3 0-.7.1-1 .5-.4.5-.6 1-.4 1.8.4 1.6 2.2 3.4 3.7 4.2 1.4.7 2.4.8 3 .5.5-.2 1-.8 1.1-1.3 0-.2-.1-.3-.4-.5l-1.6-.8c-.3-.1-.4 0-.6.2l-.6.7c-.2.2-.4.2-.7.1-.7-.3-1.6-1-2.1-1.6-.2-.2-.2-.4 0-.6l.5-.6c.2-.2.2-.4.1-.6Z" fill="currentColor"/></svg><span>WhatsApp</span></button>`:''}<p><strong>Confirmadas:</strong> ${confirmedCount} · <strong>Presentes:</strong> ${presentCount}</p>${admin?`<details class="meeting-action-menu"><summary aria-label="Opções de administração do encontro">⋯ Opções</summary><div class="meeting-action-buttons"><button type="button" class="outline" data-edit-meeting="${safe(id)}">Editar encontro</button><button type="button" class="danger" data-delete-meeting="${safe(id)}">Excluir encontro</button></div></details>`:''}</div></div></div>`;
 let confirmedSection='';
 if(admin&&historical){
  confirmedSection=`<div class="panel archive-presence"><div class="eyebrow">ENCONTRO ANTERIOR</div><h3>Registro histórico</h3><p class="muted">O check-in está encerrado. Não é necessário cadastrar presenças dos encontros anteriores.</p></div>`;
 }else if(admin){
  confirmedSection=`<div class="panel attendance-panel">
   <div class="attendance-heading"><div><h3>${attendanceMode==='checkin'?'Check-in do encontro':'Confirmações do encontro'}</h3><p class="muted">${attendanceMode==='checkin'?'Toque na integrante confirmada para registrar a chegada.':'Marque quem confirmou participação antes do encontro.'}</p></div><div class="attendance-count"><strong>${attendanceMode==='checkin'?presentCount:confirmedCount}</strong><span>${attendanceMode==='checkin'?'presentes':'confirmadas'}</span></div></div>
   <div class="attendance-modes" role="group" aria-label="Etapa de presença">
    <button type="button" class="${attendanceMode==='checkin'?'selected':''}" data-attendance-mode="checkin">Check-in</button>
    <button type="button" class="${attendanceMode==='confirmed'?'selected':''}" data-attendance-mode="confirmed">Confirmações <small>${confirmedCount}</small></button>
   </div>
   <div class="attendance-tools"><input id="attendanceSearch" type="search" placeholder="Buscar integrante..." aria-label="Buscar integrante" value="${safe(attendanceSearch)}"></div>
   <div class="attendance-summary">${confirmedCount} confirmadas · ${presentCount} presentes</div>
   ${attendanceMode==='checkin'?`<div class="attendance-bulk"><button type="button" class="outline" data-attendance-bulk="mark">✓ Marcar todas</button><button type="button" class="quiet" data-attendance-bulk="unmark">Desmarcar todas</button></div>`:''}
   <div id="attendanceRows" class="attendance-rows"></div>
  </div>`;
 }else{
  const confirmedPeople=a.filter(x=>x.confirmed).map(x=>participants.find(p=>p.id===x.participant_id)).filter(Boolean);
  const empty=historical?'<p class="muted">0 participantes</p>':'<p class="muted">Ainda sem confirmações.</p>';
  confirmedSection=`<div class="panel"><h3>Leitoras confirmadas (${confirmedPeople.length})</h3><div class="rows confirmed-people">${confirmedPeople.map(p=>`<div class="public-confirmed">${participantAvatar(p)}<strong>${safe(p.name)}</strong></div>`).join('')||empty}</div></div>`;
 }
 const photos=galleryMarkup(id);
 const discussion=discussionMarkup(m,isFeatured);
 const activityContent=activitiesMarkup(m);
 if(isFeatured){
  // Mostra a seção pública somente quando há perguntas efetivamente publicadas.
  // Para Admin, mantém o formulário para cadastrar e publicar perguntas.
  const questionsContent=discussion;
  const expanded=(key,defaultValue)=>Object.hasOwn(savedSections,key)?savedSections[key]:defaultValue;
  detail+=meetingAccordion(id,'confirmed',`Leitoras confirmadas (${confirmedCount})`,confirmedSection,expanded('confirmed',true));
  if(questionsContent)detail+=meetingAccordion(id,'discussion','Nossa conversa literária',questionsContent,expanded('discussion',false));
  if(activityContent)detail+=meetingAccordion(id,'activities','Nossa Roda Literária',activityContent,expanded('activities',!!clubActivities.some(x=>x.meeting_id===id&&x.status==='live')));
  detail+=meetingAccordion(id,'photos','Momentos do nosso encontro',photos,expanded('photos',false));
 }else if(historical){
  detail+=photos+confirmedSection+discussion+(activityContent?meetingAccordion(id,'activities','Nossa Roda Literária',activityContent,false):'');
 }else{
  detail+=confirmedSection+photos+discussion+(activityContent?meetingAccordion(id,'activities','Nossa Roda Literária',activityContent,false):'');
 }
 $('meetingDetail').innerHTML=detail;
 $('meetingDetail').hidden=false;
 if(admin)renderAttendanceRows();
 for(const item of clubActivities.filter(a=>a.meeting_id===id&&a.status!=='draft')){if(activityResults[item.id])paintActivityResults(item.id,activityResults[item.id]);}
}
function renderAttendanceRows(){
 const root=$('attendanceRows');if(!root||!admin||!currentMeeting||isPastMeeting(meetings.find(m=>m.id===currentMeeting)))return;
 const rows=attendance.filter(a=>a.meeting_id===currentMeeting);
 const queryText=normalized(attendanceSearch);
 let people=participants.filter(p=>p.active||rows.some(r=>r.participant_id===p.id));
 if(queryText)people=people.filter(p=>normalized(p.name).includes(queryText));
 if(attendanceMode==='checkin')people=people.filter(p=>rows.some(r=>r.participant_id===p.id&&r.confirmed));
 // Ordem alfabética estável, independentemente de check-in ou confirmação.
 people.sort((p,q)=>p.name.localeCompare(q.name,'pt-BR'));
 root.innerHTML=people.length?people.map(p=>{
  const row=rows.find(r=>r.participant_id===p.id);
  const flagged=attendanceMode==='checkin'?!!row?.checked_in:!!row?.confirmed;
  const src=photoUrl(p);
  const avatar=src?`<img src="${safe(src)}" loading="lazy" alt="" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="attendance-avatar-initials" hidden>${safe(initialsFor(p.name))}</span>`:`<span class="attendance-avatar-initials">${safe(initialsFor(p.name))}</span>`;
  return `<button type="button" class="attendance-person ${flagged?'marked':''}" data-attendance-person="${safe(p.id)}" aria-pressed="${flagged}" ${attendanceSaving?'disabled':''}>
   <span class="attendance-person-identity"><span class="attendance-avatar" aria-hidden="true">${avatar}</span><span class="attendance-person-name">${safe(p.name)}</span></span>
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
 const mainHost=mainHostParticipant(meeting);
 const excluded=participants.filter(p=>isCurrentMainHost(p,meeting)||(
  attendance.some(a=>a.meeting_id===mid&&a.checked_in&&a.confirmed&&a.participant_id===p.id)
  &&wasMainHost(p,mid)));
 $('drawNote').textContent=historicWithoutDraws?'':accepted?'Resultado aceito e registrado para este encontro.':d.length?`${d.filter(x=>x.status==='skipped').length} tentativa(s) anterior(es). A anfitriã principal deste encontro e quem já foi anfitriã principal em encontros anteriores não participam.`:'Participam as integrantes confirmadas e presentes, mesmo sem livro indicado, exceto a anfitriã principal deste encontro e quem já foi anfitriã principal antes. Quem foi apenas anfitriã convidada pode concorrer.';
 const excludedBox=$('drawExcluded');
 if(excludedBox){excludedBox.hidden=historicWithoutDraws||(!excluded.length&&!((meeting?.host||meeting?.host_participant_id)&&!mainHost));
  excludedBox.innerHTML=excluded.length?`<strong>Fora do sorteio</strong><div class="draw-exclusion-list">${excluded.map(p=>`<div><strong>${safe(p.name)}</strong> <span>— ${isCurrentMainHost(p,meeting)?'Anfitriã principal deste encontro':'Já foi anfitriã principal'}</span></div>`).join('')}</div>`:((meeting?.host||meeting?.host_participant_id)&&!mainHost?'<strong>Atenção:</strong> selecione a anfitriã principal na edição do encontro para liberar o sorteio.':'');}
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
 meetingReturnScreen=meetingScreen==='detail'?'detail':'home';
 showMeetingScreen('edit');
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
 const current=meetings.find(m=>m.id===mid);
 const hostName=normalized(current?.host||'');
 if((current?.host_participant_id||hostName&&hostName!=='a definir')&&!mainHostParticipant(current)){
  return notify('Não foi possível identificar a anfitriã principal no cadastro. Edite o encontro e selecione a anfitriã na lista antes de sortear.',true);
 }
 const previous=draws.filter(d=>d.meeting_id===mid);
 if(previous.some(d=>d.status==='accepted'))return notify('Este sorteio já tem resultado confirmado. Para começar de novo, reinicie a rodada.',true);
 // Apenas confirmadas com check-in que nunca foram anfitriãs PRINCIPAIS.
 const eligible=attendance.filter(a=>a.meeting_id===mid&&a.checked_in&&a.confirmed
  &&!previous.some(d=>d.participant_id===a.participant_id)
  &&!isCurrentMainHost(participants.find(p=>p.id===a.participant_id),current)
  &&!wasMainHost(participants.find(p=>p.id===a.participant_id),mid));
 if(!eligible.length)return notify('Não há participantes elegíveis. A anfitriã principal do encontro e quem já foi anfitriã principal não participam; confira os check-ins.',true);
 rolling=true;$('drawBtn').disabled=true;$('acceptBtn').hidden=true;
 $('drawDisplay').classList.remove('accepted');$('drawDisplay').classList.add('drawing');
 $('rollingBook').textContent='';
 // A escolha é feita ANTES da animação para garantir que a última foto
 // exibida seja exatamente a da pessoa que será registrada no sorteio.
 const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
 const pick=eligible[bytes[0]%eligible.length];
 const winner=participants.find(p=>p.id===pick.participant_id);
 const faces=eligible.map(a=>participants.find(p=>p.id===a.participant_id)).filter(Boolean);
 const otherFaces=faces.filter(p=>p.id!==winner.id);
 let spinIndex=0,interval=null;
 const spin=()=>{
  const face=otherFaces.length?otherFaces[spinIndex%otherFaces.length]:winner;
  setDrawPerson(face,false);spinIndex++;
 };
 spin();
 interval=setInterval(spin,125);
 try{
  await new Promise(resolve=>setTimeout(resolve,2550));
  clearInterval(interval);interval=null;
  setDrawPerson(winner,false);
  await new Promise(resolve=>setTimeout(resolve,420));
  const lastPending=previous.filter(d=>d.status==='pending').at(-1);
  if(lastPending)await query(db.from('draws').update({status:'skipped'}).eq('id',lastPending.id));
  await query(db.from('draws').insert({meeting_id:mid,participant_id:pick.participant_id,book_id:pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id||null,status:'pending'}));
  await load();
 }catch(e){if(interval)clearInterval(interval);notify(e.message,true);await load()}
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
function adminModalState(open){
 $('authPanel').hidden=!open;
 document.body.classList.toggle('admin-modal-open',open||!$('deleteMeetingModal').hidden);
}
function showAdminError(message){$('authError').textContent=message;$('authError').hidden=!message;}
function openAdminModal(){
 adminModalPreviousFocus=document.activeElement;
 showAdminError('');$('adminSession').hidden=!admin;$('loginForm').hidden=admin;
 adminModalState(true);
 requestAnimationFrame(()=>{(admin?$('logout'):$('email')).focus({preventScroll:true})});
}
function closeAdminModal(){
 adminModalState(false);$('loginForm').reset();showAdminError('');
 if(adminModalPreviousFocus?.isConnected)adminModalPreviousFocus.focus({preventScroll:true});
 adminModalPreviousFocus=null;
}
function openDeleteMeeting(id){
 if(!admin||deletingMeeting)return;
 const m=meetings.find(item=>item.id===id);if(!m)return;
 pendingDeleteMeetingId=id;adminModalPreviousFocus=document.activeElement;
 $('deleteMeetingDescription').textContent=`Deseja excluir o encontro “${meetingTitle(m)}”, de ${fmt(m.starts_at)}?`;
 $('deleteMeetingError').hidden=true;$('deleteMeetingModal').hidden=false;
 document.body.classList.add('admin-modal-open');
 requestAnimationFrame(()=>$('deleteMeetingCancel').focus({preventScroll:true}));
}
function closeDeleteMeeting(){
 if(deletingMeeting)return;
 $('deleteMeetingModal').hidden=true;document.body.classList.remove('admin-modal-open');
 pendingDeleteMeetingId=null;
 if(adminModalPreviousFocus?.isConnected)adminModalPreviousFocus.focus({preventScroll:true});
 adminModalPreviousFocus=null;
}
async function deleteSelectedMeeting(){
 const id=pendingDeleteMeetingId;
 if(!admin||!id||deletingMeeting)return;
 const meeting=meetings.find(m=>m.id===id);if(!meeting)return;
 deletingMeeting=true;$('deleteMeetingConfirm').disabled=true;
 $('deleteMeetingError').hidden=true;
 try{
  // O RPC preserva os outros encontros e remove as relações em uma transação.
  await query(db.rpc('delete_club_meeting',{p_meeting_id:id}));
  const galleryPaths=meetingPhotos.filter(p=>p.meeting_id===id).map(p=>p.storage_path);
  // Somente objetos do encontro removido; arquivos dos outros encontros são preservados.
  const cleanups=[];
  if(galleryPaths.length)cleanups.push(db.storage.from('meeting-gallery').remove(galleryPaths));
  const card=meeting.card_url||'';
  const prefix=(cfg.supabaseUrl||'').replace(/\/$/,'')+'/storage/v1/object/public/meeting-cards/';
  if(card.startsWith(prefix))cleanups.push(db.storage.from('meeting-cards').remove([decodeURIComponent(card.slice(prefix.length).split('?')[0])]));
  const results=await Promise.allSettled(cleanups);
  const storageFailed=results.some(r=>r.status==='rejected'||r.value?.error);
  $('deleteMeetingModal').hidden=true;document.body.classList.remove('admin-modal-open');
  pendingDeleteMeetingId=null;adminModalPreviousFocus=null;
  meetingScreen='home';showMeetingScreen('home');await load();
  notify(storageFailed?'Encontro excluído. Alguns arquivos não puderam ser removidos do armazenamento.':'Encontro excluído com sucesso.');
 }catch(e){$('deleteMeetingError').textContent='Não foi possível excluir: '+e.message;$('deleteMeetingError').hidden=false;}
 finally{deletingMeeting=false;$('deleteMeetingConfirm').disabled=false;}
}
async function initial(){const logo=$('logo');logo.onerror=()=>{logo.hidden=true};$('brandHome').onclick=()=>{switchTab('encontros');showMeetingScreen('home');window.scrollTo({top:0,behavior:'smooth'})};$('setup').hidden=configured;document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('loginToggle').onclick=()=>openAdminModal();$('authClose').onclick=closeAdminModal;$('authCancel').onclick=closeAdminModal;document.querySelectorAll('[data-close-admin]').forEach(el=>el.onclick=closeAdminModal);$('logout').onclick=async()=>{if(!db)return;try{await query(db.auth.signOut());admin=false;birthdays=[];await loadDiscussion();closeAdminModal();await load();}catch(err){showAdminError('Não foi possível sair: '+err.message)}};$('loginForm').onsubmit=async e=>{e.preventDefault();if(!db)return showAdminError('Configure o Supabase primeiro.');const submit=$('loginSubmit');submit.disabled=true;showAdminError('');try{await query(db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await checkAdmin();if(admin){await load();closeAdminModal();}else{await db.auth.signOut();birthdays=[];await load();showAdminError('Esta conta não possui permissão de administração.');}}catch(err){showAdminError('Não foi possível entrar: '+err.message)}finally{submit.disabled=false}};$('deleteMeetingClose').onclick=closeDeleteMeeting;$('deleteMeetingCancel').onclick=closeDeleteMeeting;document.querySelectorAll('[data-cancel-delete]').forEach(el=>el.onclick=closeDeleteMeeting);$('deleteMeetingConfirm').onclick=deleteSelectedMeeting;document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('deleteMeetingModal').hidden)closeDeleteMeeting();else if(!$('authPanel').hidden)closeAdminModal()}});
$('searchCoverInEditor').onclick=()=>{const p=participants.find(x=>x.id===$('participantId').value);const b=bookForParticipant(p);if(b)openCoverSearch(b.id)};
 $('closeCoverManager').onclick=()=>{$('coverManager').hidden=true;coverBookId=null};
 $('cancelCover').onclick=()=>{coverBookId=null;$('coverEditor').hidden=true;$('coverManager').hidden=true};
 $('uploadCover').onclick=async()=>{if(coverBusy)return;try{$('uploadCover').disabled=true;await uploadCover()}catch(err){$('coverFeedback').textContent=err.message}finally{$('uploadCover').disabled=false}};
 $('participantBook').addEventListener('input',()=>{$('participantReadWrap').hidden=!$('participantBook').value.trim();refreshParticipantCoverControls()});$('participantAuthor').addEventListener('input',refreshParticipantCoverControls);
 $('newParticipant').onclick=()=>participantEditor(null);$('cancelParticipant').onclick=()=>$('participantEditor').hidden=true;$('newMeeting').onclick=()=>meetingEditor(null);$('cancelMeeting').onclick=()=>{showMeetingScreen(meetingReturnScreen);if(meetingReturnScreen==='detail'&&currentMeeting)renderDetail(currentMeeting);window.scrollTo({top:0,behavior:'smooth'})};
$('meetingForm').onsubmit=async e=>{e.preventDefault();try{let old=meetings.find(m=>m.id===$('meetingId').value);let card_url=old?.card_url||'';let file=$('meetingImage').files[0];if(file){if(file.size>5242880)throw Error('O card deve ter até 5 MB.');const ext=file.name.split('.').pop().toLowerCase();const path=`${crypto.randomUUID()}.${ext}`;await query(db.storage.from('meeting-cards').upload(path,file,{contentType:file.type}));card_url=db.storage.from('meeting-cards').getPublicUrl(path).data.publicUrl}const selectedBook=$('meetingBook').value;
 if(selectedBook==='legacy')throw Error('Selecione o livro cadastrado para vincular este encontro.');
 const book=books.find(b=>b.id===selectedBook);
 const host=$('meetingHost').value.trim(), co_host=$('meetingCoHost').value.trim()||null;
 const hostPerson=participants.find(p=>p.name===host), coHostPerson=participants.find(p=>p.name===co_host);
 const row={title:book?.title||'Livro a definir',book_id:book?.id||null,starts_at:$('meetingDate').value?new Date($('meetingDate').value).toISOString():null,place:$('meetingPlace').value.trim(),host,co_host,host_participant_id:hostPerson?.id||null,co_host_participant_id:coHostPerson?.id||null,card_url};if(row.host&&row.co_host&&row.host===row.co_host)throw Error('Escolha duas integrantes diferentes para anfitriãs.');if(old)await query(db.from('meetings').update(row).eq('id',old.id));else await query(db.from('meetings').insert(row));$('meetingFormPanel').hidden=true;showMeetingScreen('home');await load();notify('Encontro salvo!')}catch(err){notify(err.message,true)}};
$('participantForm').onsubmit=async e=>{e.preventDefault();if(!admin)return;const btn=$('saveParticipant');btn.disabled=true;try{const id=$('participantId').value;const name=$('participantName').value.trim(),title=$('participantBook').value.trim(),author=$('participantAuthor').value.trim();if(!name)throw Error('Preencha o nome da integrante.');if(author&&!title)throw Error('Informe o título do livro ou deixe também a autoria em branco.');const readByClub=$('participantRead').checked;
 const birthdayDay=$('participantBirthdayDay').value.trim(),birthdayMonth=$('participantBirthdayMonth').value.trim();
 if(Boolean(birthdayDay)!==Boolean(birthdayMonth))throw Error('Preencha o dia e o mês do aniversário ou deixe ambos vazios.');
 const hasBirthday=!!birthdayDay&&!!birthdayMonth;
 if(hasBirthday){const d=Number(birthdayDay),m=Number(birthdayMonth);const maxDay=new Date(Date.UTC(2024,m,0)).getUTCDate();if(!Number.isInteger(d)||!Number.isInteger(m)||m<1||m>12||d<1||d>maxDay)throw Error('Informe uma data de aniversário válida.');}
 if($('participantBirthdayPublic').checked&&!hasBirthday)throw Error('Informe a data antes de autorizar a exibição do aniversário.');
 const old=participants.find(p=>p.id===id);const oldBook=bookForParticipant(old);let bookId=oldBook?.id||null;let createdBookId=null;
if(!title){bookId=null;}else if(!oldBook||oldBook.title!==title||oldBook.author!==author){const existing=books.find(b=>b.title.toLocaleLowerCase('pt-BR')===title.toLocaleLowerCase('pt-BR')&&b.author.toLocaleLowerCase('pt-BR')===author.toLocaleLowerCase('pt-BR'));if(existing){bookId=existing.id;}else{const result=await query(db.from('books').insert({title,author}).select('id').single());bookId=result.id;createdBookId=bookId;}}
let savedParticipantId=id;
 try{if(old){await query(db.from('participants').update({name,suggested_book_id:bookId}).eq('id',id))}else{const inserted=await query(db.from('participants').insert({name,suggested_book_id:bookId}).select('id').single());savedParticipantId=inserted.id;}}catch(err){if(createdBookId)await db.from('books').delete().eq('id',createdBookId);throw err;}
 if(hasBirthday){await query(db.from('participant_birthdays').upsert({participant_id:savedParticipantId,birth_day:Number(birthdayDay),birth_month:Number(birthdayMonth),show_public:$('participantBirthdayPublic').checked},{onConflict:'participant_id'}));}
 else if(old&&birthdayForParticipant(id)){await query(db.from('participant_birthdays').delete().eq('participant_id',id));}
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
document.body.addEventListener('click',e=>{
 const btn=e.target.closest('[data-birthday-change]');if(!btn)return;
 birthdayViewMonth=((birthdayViewMonth-1+Number(btn.dataset.birthdayChange)+12)%12)+1;
 renderBirthdayMonth();
});
document.body.addEventListener('click',e=>{const button=e.target.closest('[data-share-meeting]');if(button&&admin)shareMeeting(button.dataset.shareMeeting)});
document.body.addEventListener('change',e=>{const el=e.target.closest('[data-discussion-publish]');if(el&&admin)updateDiscussionPublication(el.dataset.discussionPublish,el.checked)});
document.body.addEventListener('submit',e=>{const form=e.target.closest('[data-discussion-form]');if(!form)return;e.preventDefault();if(admin)addDiscussionQuestion(form.dataset.discussionForm,form.elements.question.value)});
document.body.addEventListener('click',e=>{const move=e.target.closest('[data-discussion-move]');const edit=e.target.closest('[data-discussion-edit]');const del=e.target.closest('[data-discussion-delete]');if(move&&admin)moveDiscussionQuestion(move.dataset.discussionMove,move.dataset.direction);else if(edit&&admin)editDiscussionQuestion(edit.dataset.discussionEdit);else if(del&&admin)deleteDiscussionQuestion(del.dataset.discussionDelete)});
document.body.addEventListener('click',e=>{const btn=e.target.closest('[data-attendance-bulk]');if(btn&&admin)bulkCheckIn(btn.dataset.attendanceBulk==='mark');});
document.body.addEventListener('input',e=>{
 if(e.target.id!=='attendanceSearch')return;
 attendanceSearch=e.target.value;renderAttendanceRows();
 const el=$('attendanceSearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}
});
document.body.addEventListener('click',e=>{
 const del=e.target.closest('[data-delete-meeting]');if(del&&admin){openDeleteMeeting(del.dataset.deleteMeeting);return;}
 const go=e.target.closest('[data-meeting-go]');if(go){meetingNavigate(go.dataset.meetingGo);return}
 const back=e.target.closest('[data-meeting-back]');if(back){let target=back.dataset.meetingBack==='home'?'home':meetingScreen==='edit'?meetingReturnScreen:meetingReturnList; if(target==='detail'&&currentMeeting)renderDetail(currentMeeting);meetingNavigate(target);}
});
document.body.addEventListener('click',async e=>{let t=e.target.closest('[data-open],[data-edit-meeting],[data-active],[data-edit-participant],[data-delete-participant],[data-cover-book],[data-choose-cover]');if(!t)return;try{
 if(t.dataset.coverBook){await openCoverSearch(t.dataset.coverBook);return}
 if(t.dataset.chooseCover!==undefined){if(coverBusy)return;const candidate=coverOptions[Number(t.dataset.chooseCover)];if(candidate){await saveCover(candidate.url)}return}
 if(t.dataset.open){openMeetingScreen(t.dataset.open)}if(admin&&t.dataset.editParticipant)participantEditor(participants.find(p=>p.id===t.dataset.editParticipant));if(admin&&t.dataset.deleteParticipant)await deleteParticipant(t.dataset.deleteParticipant);if(admin&&t.dataset.editMeeting)meetingEditor(meetings.find(m=>m.id===t.dataset.editMeeting));if(admin&&t.dataset.active){let p=participants.find(p=>p.id===t.dataset.active);await query(db.from('participants').update({active:!p.active}).eq('id',p.id));await load()}}catch(err){notify(err.message,true)}});
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
if(db){await checkAdmin();await load();startActivityUpdates();}}
async function checkAdmin(){const {data}=await db.auth.getUser();const user=data?.user;admin=false;if(user){try{const rows=await query(db.from('admins').select('user_id').eq('user_id',user.id));admin=rows.length>0}catch(e){console.warn(e)}}await loadDiscussion();render()}
// Aguarda todos os elementos do HTML, incluindo os modais no fim da pagina.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { initial().catch(err => console.error("Falha ao iniciar o clube:", err)); }, { once: true });
} else {
  initial().catch(err => console.error("Falha ao iniciar o clube:", err));
}

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

// Galeria dos encontros — controles disponíveis nas telas de detalhes.
document.body.addEventListener('click',async e=>{
 if(e.target.closest('#galleryUploadButton')){await uploadMeetingGallery();return;}
 const del=e.target.closest('[data-delete-gallery]');if(del){await deleteMeetingGallery(del.dataset.deleteGallery);return;}
 const open=e.target.closest('[data-open-gallery]');if(open){openGalleryPhoto(open.dataset.openGallery);return;}
 if(e.target.closest('#galleryClose')||e.target.id==='galleryModal'){closeGalleryPhoto();return;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('galleryModal')&&!$('galleryModal').hidden)closeGalleryPhoto();});
