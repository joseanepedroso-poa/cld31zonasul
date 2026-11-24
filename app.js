/* Clube de Leitura d'Elas — todas as gravações passam pelo RLS do Supabase. */
const $=id=>document.getElementById(id), cfg=window.CLUBE_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabasePublishableKey&&window.supabase);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let admin=false,participants=[],books=[],meetings=[],attendance=[],draws=[],currentMeeting=null,rolling=false;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x?new Date(x).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}):'Data a definir';
function notify(s,error=false){const el=$('message');el.textContent=s;el.className='notice'+(error?' error':'');el.hidden=false;window.scrollTo({top:0,behavior:'smooth'});}
async function query(p){const {data,error}=await p;if(error)throw error;return data}
async function load(){if(!db)return;try{[participants,books,meetings,attendance,draws]=await Promise.all([query(db.from('participants').select('*').order('name')),query(db.from('books').select('*').order('title')),query(db.from('meetings').select('*').order('starts_at',{ascending:false})),query(db.from('attendance').select('*')),query(db.from('draws').select('*').order('created_at'))]);render();}catch(e){notify('Não foi possível carregar os dados: '+e.message,true)}}
function switchTab(t){document.querySelectorAll('.tab').forEach(el=>el.hidden=el.id!==`tab-${t}`);document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));}
function render(){document.querySelectorAll('.admin-only').forEach(el=>{if(!['meetingFormPanel','participantEditor','authPanel'].includes(el.id))el.hidden=!admin});$('loginToggle').textContent=admin?'Admin · Sair':'Entrar como admin';renderMeetings();renderParticipants();renderDraws();if(currentMeeting)renderDetail(currentMeeting);}
function isUpcoming(m){if(!m.starts_at)return false;const end=new Date(m.starts_at);end.setHours(23,59,59,999);return end>=new Date();}
function meetingCard(m,featured=false){const count=attendance.filter(a=>a.meeting_id===m.id&&a.confirmed).length;return `<article class="meeting-card ${featured?'featured':''}">${m.card_url?`<img src="${safe(m.card_url)}" alt="Card de divulgação do encontro" loading="lazy">`:'<div class="placeholder">Card do encontro em breve</div>'}<div class="content"><div class="eyebrow">${featured?'PRÓXIMA LEITURA':'ENCONTRO'}</div><h3>${safe(m.title||'Livro a definir')}</h3><div class="meta">${safe(fmt(m.starts_at))}<br>Anfitriã: ${safe(m.host||'A definir')}<br>${safe(m.place||'Local a definir')}</div>${featured&&(!m.starts_at||!m.place||!m.card_url)?'<div class="soon">Em breve, mais informações sobre o encontro.</div>':''}<button class="outline" data-open="${safe(m.id)}">Ver detalhes${admin?` · ${count} confirmada(s)`:''}</button></div></article>`}
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
function bookForParticipant(p){return books.find(b=>b.id===p?.suggested_book_id)}
function renderParticipants(){const visible=admin?participants:participants.filter(p=>p.active);$('participantList').innerHTML=visible.length?visible.map(p=>{const b=bookForParticipant(p);return `<div class="item participant-item"><div class="participant-main"><strong>${safe(p.name)}</strong><div class="participant-book">${b?`<svg class="book-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Z"/><path d="M12 6v14"/></svg><span>${safe(b.title)}</span>`:'<span class="no-book">Sem indicação cadastrada</span>'}</div>${b?.author?`<div class="participant-author">${safe(b.author)}</div>`:''}${admin?`<div class="small">${p.active?'Ativa':'Inativa'}</div>`:''}</div>${admin?`<div class="right"><button class="outline" data-edit-participant="${safe(p.id)}">Editar</button><button class="quiet" data-active="${safe(p.id)}">${p.active?'Desativar':'Reativar'}</button><button class="danger" data-delete-participant="${safe(p.id)}" aria-label="Excluir ${safe(p.name)}">Excluir</button></div>`:''}</div>`}).join(''):'<div class="empty">Nenhuma integrante cadastrada.</div>'}
function participantEditor(p){if(!admin)return;$('participantEditor').hidden=false;$('participantId').value=p?.id||'';$('participantName').value=p?.name||'';const b=bookForParticipant(p);$('participantBook').value=b?.title||'';$('participantAuthor').value=b?.author||'';$('participantFormHeading').textContent=p?'Editar integrante e indicação':'Cadastrar integrante e livro';$('participantEditor').scrollIntoView({behavior:'smooth',block:'start'});}
function renderDetail(id){const m=meetings.find(x=>x.id===id);if(!m)return;currentMeeting=id;const a=attendance.filter(x=>x.meeting_id===id);let detail=`<div class="panel"><div class="meeting-info"><div>${m.card_url?`<img class="meeting-banner" src="${safe(m.card_url)}" alt="Card do encontro">`:'<div class="placeholder">Encontro do Clube</div>'}</div><div><div class="eyebrow">NOSSO ENCONTRO</div><h2>${safe(m.title)}</h2><p>${safe(fmt(m.starts_at))}</p><p><strong>Local:</strong> ${safe(m.place||'A definir')}</p><p><strong>Anfitriã:</strong> ${safe(m.host||'A definir')}</p><p><strong>Confirmadas:</strong> ${a.filter(x=>x.confirmed).length} · <strong>Presentes:</strong> ${a.filter(x=>x.checked_in).length}</p>${admin?`<button class="outline" data-edit-meeting="${safe(id)}">Editar encontro</button>`:''}</div></div></div>`;
if(admin){detail+=`<div class="panel"><h3>Confirmações e check-in</h3><p class="muted">Marque a confirmação antes do encontro. No dia, marque quem compareceu O livro indicado já vem do cadastro de cada integrante.</p><div class="rows">${participants.filter(p=>p.active||a.some(x=>x.participant_id===p.id)).map(p=>{let row=a.find(x=>x.participant_id===p.id);let book=books.find(b=>b.id===(row?.suggested_book_id||p.suggested_book_id));return `<div class="item"><strong>${safe(p.name)}</strong><div class="right"><label><input data-flag="confirmed" data-person="${safe(p.id)}" type="checkbox" ${row?.confirmed?'checked':''}> Confirmou</label><label><input data-flag="checked_in" data-person="${safe(p.id)}" type="checkbox" ${row?.checked_in?'checked':''}> Presente</label><span class="small">${book?safe(book.title):'Sem livro indicado · edite a integrante'}</span></div></div>`}).join('')}</div></div>`}else{detail+=`<div class="panel"><h3>Confirmadas</h3><div class="rows">${a.filter(x=>x.confirmed).map(x=>{let p=participants.find(p=>p.id===x.participant_id);return p?`<div class="item"><strong>${safe(p.name.split(' ')[0])}</strong><span class="badge ${x.checked_in?'yes':''}">${x.checked_in?'Presente':'Confirmada'}</span></div>`:''}).join('')||'<p class="muted">Ainda sem confirmações.</p>'}</div></div>`;}
$('meetingDetail').innerHTML=detail;$('meetingDetail').hidden=false;}
function renderDraws(){
 const mid=$('drawMeeting').value||meetings[0]?.id;
 const d=draws.filter(x=>x.meeting_id===mid);
 const accepted=d.find(x=>x.status==='accepted');
 const last=accepted||d.at(-1);
 $('drawHistory').innerHTML=d.length?d.map(x=>{let p=participants.find(p=>p.id===x.participant_id),b=books.find(b=>b.id===x.book_id);return `<div class="item draw-history-item"><div><strong>${safe(p?.name||'Participante')}</strong><div class="small">${safe(b?.title||'Livro não informado')}</div></div><span class="badge ${x.status==='accepted'?'yes':''}">${x.status==='accepted'?'✓ Aceitou':x.status==='skipped'?'Não disponível':'Aguardando resposta'}</span></div>`}).join(''):'<div class="empty">Ainda não houve sorteio neste encontro.</div>';
 $('rollingName').textContent=last?participants.find(p=>p.id===last.participant_id)?.name||'Quem será?':'Quem será?';
 $('rollingBook').textContent=last?books.find(b=>b.id===last.book_id)?.title||'':'';
 $('drawDisplay').classList.toggle('accepted',!!accepted);
 $('drawAccepted').hidden=!accepted;
 $('drawBtn').textContent=d.length?'↻ Sortear novamente':'Iniciar sorteio';
 $('drawBtn').hidden=!admin||!!accepted;
 $('acceptBtn').hidden=!(admin&&last?.status==='pending'&&!accepted);
 $('resetDraws').hidden=!admin||!d.length;
 $('drawNote').textContent=accepted?'Resultado aceito e registrado para este encontro.':d.length?`${d.filter(x=>x.status==='skipped').length} sorteada(s) excluída(s) das próximas tentativas. Confirme quando a pessoa aceitar.`:'Somente integrantes com check-in e livro indicado participam do sorteio.';
}
async function saveAttendance(person,changes){let m=currentMeeting;if(!m)return;let old=attendance.find(x=>x.meeting_id===m&&x.participant_id===person);let row={meeting_id:m,participant_id:person,confirmed:old?.confirmed||false,checked_in:old?.checked_in||false,suggested_book_id:old?.suggested_book_id||participants.find(p=>p.id===person)?.suggested_book_id||null,...changes};if(row.checked_in)row.confirmed=true;if(!row.confirmed)row.checked_in=false;await query(db.from('attendance').upsert(row,{onConflict:'meeting_id,participant_id'}));await load();}
function meetingEditor(m){$('meetingFormPanel').hidden=false;$('meetingId').value=m?.id||'';$('meetingTitle').value=m?.title||'';$('meetingDate').value=m?.starts_at?new Date(new Date(m.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';$('meetingHost').value=m?.host||'';$('meetingPlace').value=m?.place||'';$('meetingImage').value='';$('meetingFormPanel').scrollIntoView({behavior:'smooth'});}
async function runDraw(){if(!admin||rolling)return;const mid=$('drawMeeting').value;if(!mid)return notify('Cadastre um encontro primeiro.',true);const previous=draws.filter(d=>d.meeting_id===mid);if(previous.some(d=>d.status==='accepted'))return notify('Este sorteio já tem resultado confirmado. Para começar de novo, reinicie a rodada.',true);const eligible=attendance.filter(x=>x.meeting_id===mid&&x.checked_in&&(x.suggested_book_id||participants.find(p=>p.id===x.participant_id)?.suggested_book_id)&&!previous.some(d=>d.participant_id===x.participant_id));if(!eligible.length)return notify('Não há mais integrantes presentes com livro indicado disponíveis para sorteio.',true);rolling=true;$('drawBtn').disabled=true;const interval=setInterval(()=>{const pick=eligible[Math.floor(Math.random()*eligible.length)];$('rollingName').textContent=participants.find(p=>p.id===pick.participant_id)?.name||'';$('rollingBook').textContent=books.find(b=>b.id===(pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id))?.title||'';},75);setTimeout(async()=>{clearInterval(interval);try{const random=new Uint32Array(1);crypto.getRandomValues(random);const pick=eligible[random[0]%eligible.length];const lastPending=previous.filter(d=>d.status==='pending').at(-1);if(lastPending)await query(db.from('draws').update({status:'skipped'}).eq('id',lastPending.id));await query(db.from('draws').insert({meeting_id:mid,participant_id:pick.participant_id,book_id:pick.suggested_book_id||participants.find(p=>p.id===pick.participant_id)?.suggested_book_id,status:'pending'}));await load();}catch(e){notify(e.message,true)}finally{rolling=false;$('drawBtn').disabled=false}},2600);}
async function initial(){const logo=$('logo');logo.onerror=()=>{logo.hidden=true};$('setup').hidden=configured;document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('loginToggle').onclick=async()=>{if(admin){await db.auth.signOut();admin=false;$('authPanel').hidden=true;render()}else{$('authPanel').hidden=!$('authPanel').hidden;$('authPanel').scrollIntoView({behavior:'smooth'})}};$('logout').onclick=async()=>{await db.auth.signOut();admin=false;render()};$('loginForm').onsubmit=async e=>{e.preventDefault();if(!db)return notify('Configure o Supabase primeiro.',true);try{await query(db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await checkAdmin();$('authPanel').hidden=admin;if(!admin)notify('A conta existe, mas não está autorizada como admin.',true);}catch(err){notify('Não foi possível entrar: '+err.message,true)}};
$('newParticipant').onclick=()=>participantEditor(null);$('cancelParticipant').onclick=()=>$('participantEditor').hidden=true;$('newMeeting').onclick=()=>meetingEditor(null);$('cancelMeeting').onclick=()=>$('meetingFormPanel').hidden=true;
$('meetingForm').onsubmit=async e=>{e.preventDefault();try{let old=meetings.find(m=>m.id===$('meetingId').value);let card_url=old?.card_url||'';let file=$('meetingImage').files[0];if(file){if(file.size>5242880)throw Error('O card deve ter até 5 MB.');const ext=file.name.split('.').pop().toLowerCase();const path=`${crypto.randomUUID()}.${ext}`;await query(db.storage.from('meeting-cards').upload(path,file,{contentType:file.type}));card_url=db.storage.from('meeting-cards').getPublicUrl(path).data.publicUrl}const row={title:$('meetingTitle').value.trim(),starts_at:$('meetingDate').value?new Date($('meetingDate').value).toISOString():null,place:$('meetingPlace').value.trim(),host:$('meetingHost').value.trim(),card_url};if(old)await query(db.from('meetings').update(row).eq('id',old.id));else await query(db.from('meetings').insert(row));$('meetingFormPanel').hidden=true;await load();notify('Encontro salvo!')}catch(err){notify(err.message,true)}};
$('participantForm').onsubmit=async e=>{e.preventDefault();if(!admin)return;const btn=$('saveParticipant');btn.disabled=true;try{const id=$('participantId').value;const name=$('participantName').value.trim(),title=$('participantBook').value.trim(),author=$('participantAuthor').value.trim();if(!name)throw Error('Preencha o nome da integrante.');if(author&&!title)throw Error('Informe o título do livro ou deixe também a autoria em branco.');const old=participants.find(p=>p.id===id);const oldBook=bookForParticipant(old);let bookId=oldBook?.id||null;let createdBookId=null;
if(!title){bookId=null;}else if(!oldBook||oldBook.title!==title||oldBook.author!==author){const existing=books.find(b=>b.title.toLocaleLowerCase('pt-BR')===title.toLocaleLowerCase('pt-BR')&&b.author.toLocaleLowerCase('pt-BR')===author.toLocaleLowerCase('pt-BR'));if(existing){bookId=existing.id;}else{const result=await query(db.from('books').insert({title,author}).select('id').single());bookId=result.id;createdBookId=bookId;}}
try{if(old){await query(db.from('participants').update({name,suggested_book_id:bookId}).eq('id',id))}else{await query(db.from('participants').insert({name,suggested_book_id:bookId}))}}catch(err){if(createdBookId)await db.from('books').delete().eq('id',createdBookId);throw err;}
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
document.body.addEventListener('click',async e=>{let t=e.target.closest('[data-open],[data-edit-meeting],[data-active],[data-edit-participant],[data-delete-participant]');if(!t)return;try{if(t.dataset.open){renderDetail(t.dataset.open);$('meetingDetail').scrollIntoView({behavior:'smooth'})}if(admin&&t.dataset.editParticipant)participantEditor(participants.find(p=>p.id===t.dataset.editParticipant));if(admin&&t.dataset.deleteParticipant)await deleteParticipant(t.dataset.deleteParticipant);if(admin&&t.dataset.editMeeting)meetingEditor(meetings.find(m=>m.id===t.dataset.editMeeting));if(admin&&t.dataset.active){let p=participants.find(p=>p.id===t.dataset.active);await query(db.from('participants').update({active:!p.active}).eq('id',p.id));await load()}}catch(err){notify(err.message,true)}});
document.body.addEventListener('change',async e=>{const t=e.target;if(!admin)return;try{if(t.dataset.flag)await saveAttendance(t.dataset.person,{[t.dataset.flag]:t.checked});}catch(err){notify(err.message,true);await load()}});
$('drawMeeting').onchange=renderDraws;$('drawBtn').onclick=runDraw;$('acceptBtn').onclick=async()=>{
 if(!admin||rolling)return;
 const mid=$('drawMeeting').value, d=draws.filter(x=>x.meeting_id===mid).at(-1);
 if(!d||d.status!=='pending')return;
 const name=participants.find(p=>p.id===d.participant_id)?.name||'a participante';
 const book=books.find(b=>b.id===d.book_id);
 if(!confirm(`Confirmar que ${name} aceitou ser anfitriã e que o próximo livro será “${book?.title||'a definir'}”?`))return;
 try{
  await query(db.from('draws').update({status:'accepted'}).eq('id',d.id));
  let draftCreated=false,draftError=null;
  if(book){
   const existing=meetings.some(m=>m.id!==mid&&m.title.trim().toLocaleLowerCase('pt-BR')===book.title.trim().toLocaleLowerCase('pt-BR')&&m.host.trim().toLocaleLowerCase('pt-BR')===name.trim().toLocaleLowerCase('pt-BR'));
   if(!existing){try{await query(db.from('meetings').insert({title:book.title,host:name,place:'',card_url:'',starts_at:null}));draftCreated=true}catch(err){draftError=err;}}
  }
  await load();
  if(draftError)notify('Resultado confirmado, mas não foi possível criar o próximo encontro: '+draftError.message,true);
  else notify(draftCreated?'✓ Aceite registrado! Um rascunho do próximo encontro foi criado com livro e anfitriã.':'✓ Aceite registrado! O resultado está confirmado.');
 }catch(e){notify(e.message,true)}
};
$('resetDraws').onclick=async()=>{if(!admin||rolling)return;if(!confirm('Atenção: reiniciar apaga o histórico de sorteios deste encontro, inclusive resultados confirmados. Deseja continuar?'))return;try{await query(db.from('draws').delete().eq('meeting_id',$('drawMeeting').value));await load()}catch(e){notify(e.message,true)}};
if(db){await checkAdmin();await load()}}
async function checkAdmin(){const {data}=await db.auth.getUser();const user=data?.user;admin=false;if(user){try{const rows=await query(db.from('admins').select('user_id').eq('user_id',user.id));admin=rows.length>0}catch(e){console.warn(e)}}render()}
initial();
