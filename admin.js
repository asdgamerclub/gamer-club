import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.10';
const store='gc_admin_public_config_v1';
const $=id=>document.getElementById(id);
let client=null,selected=null,lastToken=null,scannerStream=null,scannerTimer=null,scannerBusy=false;
$('year').textContent=new Date().getFullYear();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function notice(message,type=''){const n=$('notice');n.className='notice '+type;n.textContent=message;}
function show(id){if(id!=='dashboard')stopScanner();for(const k of ['setup','login','dashboard'])$(k).hidden=k!==id;if(id!=='dashboard')$('member').hidden=true;}
function config(){try{return JSON.parse(localStorage.getItem(store))}catch{return null}}
function useConfig(c){const u=new URL(c.url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password||u.search||u.hash)throw Error('Usa l’URL HTTPS del progetto Supabase.');if(!c.key||!(/^(sb_publishable_|eyJ)/.test(c.key)))throw Error('Usa soltanto la chiave publishable o anon public. Non inserire chiavi segrete.');client=createClient(u.origin,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return {url:u.origin,key:c.key};}
async function verify(){const {data:{user},error}=await client.auth.getUser();if(error||!user){show('login');return;}const {data, error:opError}=await client.rpc('gc_is_operator');if(opError||data!==true){await client.auth.signOut();selected=null;show('login');notice('Account non autorizzato come operatore.','error');return;}show('dashboard');notice('Accesso operatore autorizzato.','success');loadMembers();loadGalleryModeration();loadPointRequests();}
async function init(){const c=config();if(!c){show('setup');$('url').value='https://vbymfpijstibabzijahi.supabase.co';return}try{if(c.url&&c.url.includes('vbymfpjistibabzijahi.supabase.co')){c.url=c.url.replace('vbymfpjistibabzijahi.supabase.co','vbymfpijstibabzijahi.supabase.co');localStorage.setItem(store,JSON.stringify(c));}useConfig(c);$('url').value=c.url;$('key').value=c.key;await verify();}catch(e){show('setup');notice(e.message,'error');}}
$('config-form').addEventListener('submit',async e=>{e.preventDefault();try{const c=useConfig({url:$('url').value.trim(),key:$('key').value.trim()});localStorage.setItem(store,JSON.stringify(c));notice('Configurazione pubblica salvata in questo browser. Ora accedi.');await verify();}catch(err){notice(err.message,'error');}});
$('change').addEventListener('click',async()=>{if(client)await client.auth.signOut();client=null;selected=null;show('setup');});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;if(b)b.disabled=true;try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(error)throw error;await verify();}catch(err){notice('Accesso non riuscito: '+err.message,'error');}finally{if(b)b.disabled=false;}});
$('logout').addEventListener('click',async()=>{await client.auth.signOut();selected=null;lastToken=null;resetWalletLink();show('login');notice('Sessione terminata.');});
let cardTier='blue';
async function refreshTier(memberId){
  const el=$('card-tier'),desc=$('tier-description'),gold=$('gold-toggle');
  if(!client||!memberId)return;
  const {data,error}=await client.rpc('gc_card_tier',{p_member:memberId});
  if(error){
    el.textContent='BLU';el.dataset.tier='blue';
    desc.textContent='Per attivare i livelli Argento e Oro, applica la migrazione v4 nel SQL Editor.';
    gold.hidden=true;return;
  }
  cardTier=['blue','silver','gold'].includes(data)?data:'blue';
  const labels={blue:'BLU',silver:'ARGENTO',gold:'ORO'};
  el.textContent=labels[cardTier];el.dataset.tier=cardTier;
  desc.textContent=cardTier==='gold'?'Tessera riservata a un collaboratore autorizzato.':
    cardTier==='silver'?'Oltre 10 premi riscattati: livello Argento attivo.':
    'Livello Blu: il passaggio ad Argento avviene dopo l’11° premio riscattato.';
  gold.hidden=false;
  gold.textContent=cardTier==='gold'?'Rimuovi livello Oro':'Assegna livello Oro';
  gold.disabled=selected?.status!=='active';
}
$('gold-toggle').addEventListener('click',async()=>{
  if(!selected||!client||selected.status!=='active')return;
  const enable=cardTier!=='gold';
  if(!window.confirm(enable?'Assegnare manualmente una delle cinque tessere Oro a questo collaboratore?':'Revocare il livello Oro a questa tessera?'))return;
  const button=$('gold-toggle');button.disabled=true;
  try{
    const {data,error}=await client.rpc('gc_operator_set_gold',{p_member:selected.member_id,p_enable:enable});
    if(error)throw error;
    await refreshTier(selected.member_id);
    notice('Livello tessera aggiornato. Tessere Oro assegnate: '+data+' su 5.','success');
  }catch(error){notice('Modifica livello non riuscita: '+error.message,'error');}
  finally{button.disabled=false;}
});
function resetWalletLink(){
  const link=$('wallet-save'),feedback=$('wallet-feedback');
  link.hidden=true;link.removeAttribute('href');feedback.textContent='';
}
$('wallet-generate').addEventListener('click',async()=>{
  if(!client||!selected||!lastToken||selected.status!=='active')return;
  resetWalletLink();
  const button=$('wallet-generate');button.disabled=true;
  const feedback=$('wallet-feedback');
  feedback.textContent='Preparazione tessera in corso…';
  try{
    const {data,error}=await client.functions.invoke('gamer-wallet-test',{
      method:'POST',body:{qr_token:lastToken}
    });
    if(error){
      let message=error.message;
      if(error.context){
        try{const payload=await error.context.json();message=payload.error||message;}catch{}
      }
      throw new Error(message);
    }
    if(!data?.saveUrl||!/^https:\/\/pay\.google\.com\/gp\/v\/save\/[A-Za-z0-9._-]+$/.test(data.saveUrl))
      throw new Error('La funzione non ha restituito un collegamento Wallet valido.');
    const link=$('wallet-save');
    link.href=data.saveUrl;link.hidden=false;
    feedback.textContent='Tessera '+(data.tier||'')+' del socio n. '+(data.memberNumber||'')+
      ' preparata. Apri il collegamento soltanto su un account Google autorizzato per i test.';
    notice('Collegamento Google Wallet di test generato.','success');
  }catch(error){
    feedback.textContent='Impossibile preparare la tessera: '+error.message+
      ' Se compare 401, controlla in Supabase che la funzione accetti il JWT utente.';
    notice('Creazione tessera Google Wallet non riuscita.','error');
  }finally{button.disabled=selected?.status!=='active';}
});
async function loadPointRequests(){
 if(!client)return;
 const container=$('point-request-list');container.replaceChildren();
 const message=$('point-request-feedback');
 const {data,error}=await client.rpc('gc_operator_pending_points',{p_limit:40});
 if(error){message.textContent='Gestione richieste non ancora attiva: esegui la migrazione v5. '+error.message;return;}
 if(!data?.length){message.textContent='Nessuna richiesta di punti in attesa.';return;}
 message.textContent=data.length+' richieste da verificare alla cassa.';
 for(const r of data){
  const row=document.createElement('div');row.className='member-row';
  const info=document.createElement('div');const name=document.createElement('strong');
  name.textContent=r.first_name+' '+r.last_name+' · Socio #'+r.member_number;
  const time=document.createElement('p');time.textContent='Richiesta del '+new Date(r.created_at).toLocaleString('it-IT');
  info.append(name,time);row.append(info);
  const actions=document.createElement('div');actions.className='actions';
  for(const approve of [true,false]){
   const b=document.createElement('button');b.type='button';b.className=approve?'':'secondary';b.textContent=approve?'Approva +1':'Rifiuta';
   b.addEventListener('click',async()=>{
    if(!confirm(approve?'Hai verificato il pagamento di questa partita? Accredita 1 punto?':'Rifiutare la richiesta?'))return;
    for(const x of actions.querySelectorAll('button'))x.disabled=true;
    const {error}=await client.rpc('gc_operator_review_point',{p_request:r.request_id,p_approve:approve});
    if(error){message.textContent='Operazione fallita: '+error.message;for(const x of actions.querySelectorAll('button'))x.disabled=false;return;}
    await loadPointRequests();notice(approve?'Punto verificato e accreditato.':'Richiesta rifiutata.','success');
    if(selected&&selected.member_id===r.member_id&&lastToken)await lookup(lastToken);if(approve&&r.qr_token)await syncWalletAfterChange(r.qr_token);
   });actions.append(b);
  }
  row.append(actions);container.append(row);
 }
}
$('refresh-point-requests').addEventListener('click',loadPointRequests);
$('member-email-save').addEventListener('click',async()=>{
 if(!client||!selected)return;
 const email=$('member-email-input').value.trim();if(!email)return;
 if(!confirm('Hai verificato che questa email appartenga al socio?'))return;
 const b=$('member-email-save');b.disabled=true;
 try{const {error}=await client.rpc('gc_operator_set_member_email',{p_member:selected.member_id,p_email:email});
  if(error)throw error;
  notice('Email socio registrata. Ora il socio può accedere da tessera.html e collegare la tessera.','success');
 }catch(error){notice('Email non aggiornata: '+error.message,'error');}
 finally{b.disabled=false;}
});
async function syncWalletAfterChange(token){
 if(!client||!token)return false;
 try{
  const {data,error}=await client.functions.invoke('gamer-wallet-test',{
   method:'POST',body:{qr_token:token,mode:'sync'}
  });
  if(error||!data?.synced)return false;
  return true;
 }catch{return false;}
}
async function lookup(token){const {data,error}=await client.rpc('gc_member_by_qr',{p_token:token});if(error)throw error;const member=Array.isArray(data)?data[0]:null;if(!member)throw Error('Nessun socio trovato con questo token.');selected=member;lastToken=token;$('member-email-input').value='';resetWalletLink();$('wallet-generate').disabled=member.status!=='active';$('member-name').textContent=member.first_name+' '+member.last_name;$('member-number').textContent='Socio n. '+member.member_number;$('member-status').textContent=member.status;$('progress').textContent=member.progress+' / 10';$('available').textContent=member.rewards_available;$('redeemed').textContent=member.rewards_redeemed;$('member').hidden=false;$('qr-output').hidden=true;$('qr-output').replaceChildren();$('qr-show').hidden=false;$('qr-hide').hidden=true;$('add').disabled=member.status!=='active';$('redeem').disabled=member.status!=='active'||member.rewards_available<1;await refreshTier(member.member_id);}
$('search-form').addEventListener('submit',async e=>{e.preventDefault();const token=$('token').value.trim();selected=null;resetWalletLink();$('member').hidden=true;if(!uuid.test(token)){notice('Token QR non valido: occorre un UUID.','error');return;}try{await lookup(token);notice('Socio identificato. Verifica identità e stato prima di procedere.','success');}catch(err){notice(err.message,'error');}});
async function record(kind){if(!selected||!lastToken)return;const name=selected.first_name+' '+selected.last_name;const action=kind==='paid_game'?'Aggiungere 1 partita pagata':'Riscattare 1 premio per due giocatori';if(!window.confirm(action+' per '+name+'?'))return;for(const id of ['add','redeem'])$(id).disabled=true;try{const {error}=await client.rpc('gc_record_event',{p_member:selected.member_id,p_kind:kind});if(error)throw error;await lookup(lastToken);const walletSynced=await syncWalletAfterChange(lastToken);notice((kind==='paid_game'?'Partita registrata nel database.':'Premio riscattato e registrato nel database.')+(walletSynced?' Google Wallet sincronizzato.':' La tessera web è aggiornata; Google Wallet potrebbe richiedere una sincronizzazione successiva.'),'success');}catch(err){notice('Operazione non eseguita: '+err.message,'error');await lookup(lastToken).catch(()=>{$('member').hidden=true;});}}
$('add').addEventListener('click',()=>record('paid_game'));$('redeem').addEventListener('click',()=>record('reward_redeemed'));
init();

async function stopScanner(){
 if(scannerTimer){clearInterval(scannerTimer);scannerTimer=null;}
 if(scannerStream){for(const track of scannerStream.getTracks())track.stop();scannerStream=null;}
 const v=$('scan-video');v.pause();v.srcObject=null;
 $('scanner').hidden=true;$('scan-stop').hidden=true;$('scan-start').hidden=false;scannerBusy=false;
}
$('scan-start').addEventListener('click',async()=>{
 if(!navigator.mediaDevices?.getUserMedia){
  notice('La fotocamera non è disponibile in questo browser o non è autorizzata. Usa HTTPS e consenti la fotocamera nelle impostazioni.','error');return;
 }
 $('scan-start').disabled=true;
 try{
  // jsQR legge i pixel dei fotogrammi e funziona anche dove BarcodeDetector manca (es. iOS).
  const jsqrModule=await import('https://esm.sh/jsqr@1.4.0');
  const jsQR=jsqrModule.default;
  if(typeof jsQR!=='function')throw Error('Lettore QR non disponibile');
  scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  const v=$('scan-video');v.srcObject=scannerStream;
  $('scanner').hidden=false;$('scan-start').hidden=true;$('scan-stop').hidden=false;
  await v.play();
  const canvas=document.createElement('canvas');const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('Impossibile inizializzare la lettura QR');
  notice('Fotocamera attiva: inquadra il codice QR del socio.');
  scannerTimer=setInterval(async()=>{
   if(scannerBusy||v.readyState<2||!v.videoWidth||!v.videoHeight)return;
   scannerBusy=true;
   try{
    const width=Math.min(v.videoWidth,900);
    const height=Math.round(v.videoHeight*width/v.videoWidth);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    context.drawImage(v,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height);
    const foundQR=jsQR(pixels.data,width,height,{inversionAttempts:'attemptBoth'});
    const token=(foundQR?.data||'').trim();
    if(uuid.test(token)){
      await stopScanner();
      $('token').value=token;
      $('search-form').requestSubmit();
    }
   }catch(e){/* Ignora fotogrammi non leggibili. */}
   finally{scannerBusy=false;}
  },280);
 }catch(e){await stopScanner();notice('Scansione non avviata: '+e.message+'. Controlla permesso fotocamera e connessione.','error');}
 finally{$('scan-start').disabled=false;}
});
$('scan-stop').addEventListener('click',()=>stopScanner());
window.addEventListener('pagehide',()=>stopScanner());
$('qr-show').addEventListener('click',async()=>{
 if(!selected||!uuid.test(lastToken))return;
 const target=$('qr-output');target.replaceChildren();
 try{
  const {default:QRCode}=await import('https://esm.sh/qrcode@1.5.4');
  const canvas=document.createElement('canvas');
  await QRCode.toCanvas(canvas,lastToken,{width:240,margin:2,errorCorrectionLevel:'M'});
  const label=document.createElement('p');label.className='fine';label.textContent='QR di identificazione · custodire con attenzione';
  target.append(canvas,label);target.hidden=false;$('qr-show').hidden=true;$('qr-hide').hidden=false;
 }catch(e){notice('Impossibile generare il QR nel browser: '+e.message,'error');}
});
$('qr-hide').addEventListener('click',()=>{$('qr-output').hidden=true;$('qr-output').replaceChildren();$('qr-show').hidden=false;$('qr-hide').hidden=true;});

function membersFeedback(message){$('members-feedback').textContent=message;}
async function loadMembers(){
 if(!client)return;
 const container=$('members-list');container.replaceChildren();
 const {data,error}=await client.rpc('gc_operator_list_members',{p_limit:50});
 if(error){membersFeedback('Per attivare la gestione richieste, esegui in Supabase il file database/migrazione_v2_iscrizioni.sql. Dettaglio: '+error.message);return;}
 if(!data?.length){membersFeedback('Nessuna richiesta presente.');return;}
 membersFeedback(data.length+' schede disponibili.');
 for(const m of data){
  const row=document.createElement('div');row.className='member-row';
  const info=document.createElement('div');
  const title=document.createElement('strong');title.textContent=m.first_name+' '+m.last_name+' · #'+m.member_number;
  const subtitle=document.createElement('p');subtitle.textContent='Stato: '+m.status+' · Nascita: '+(m.birth_date||'non indicata');
  info.append(title,subtitle);row.append(info);
  const actions=document.createElement('div');actions.className='actions';
  const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Apri scheda';
  open.addEventListener('click',()=>{
   $('token').value=m.qr_token;
   $('search-form').requestSubmit();
   $('dashboard').scrollIntoView({behavior:'smooth',block:'start'});
  });
  actions.append(open);
  if(m.status==='pending'){
   const approve=document.createElement('button');approve.type='button';approve.textContent='Approva socio';
   approve.addEventListener('click',async()=>{
    if(!m.birth_date){membersFeedback('Data di nascita assente: integra la pratica prima di approvare.');return;}
    const dob=new Date(m.birth_date+'T12:00:00');
    const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-18);
    const minor=dob>cutoff;
    if(!window.confirm('Confermi che sono stati verificati i requisiti di ammissione e i documenti di '+m.first_name+' '+m.last_name+'?'))return;
    let guardian=false;
    if(minor){if(!window.confirm('Il richiedente è minorenne: confermi di aver verificato la documentazione del genitore/tutore?'))return;guardian=true;}
    approve.disabled=true;
    const {error}=await client.rpc('gc_operator_review_member',{p_member:m.member_id,p_status:'active',p_guardian_verified:guardian});
    if(error){membersFeedback('Approvazione non riuscita: '+error.message);approve.disabled=false;return;}
    await loadMembers();membersFeedback('Socio approvato. Puoi aprire la scheda e mostrare il QR.');
   });
   actions.append(approve);
  }
  row.append(actions);container.append(row);
 }
}
$('create-member').addEventListener('submit',async e=>{
 e.preventDefault();if(!client)return;
 const birth=$('new-birth').value;
 const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 if(!birth||birth>today||birth<'1900-01-01'){membersFeedback('Controlla la data di nascita.');return;}
 if(!window.confirm('Hai acquisito la richiesta con l’informativa privacy e la documentazione associativa necessaria?'))return;
 const btn=$('create-submit');btn.disabled=true;
 try{
  const {data,error}=await client.rpc('gc_operator_create_member',{
   p_first_name:$('new-first').value.trim(),p_last_name:$('new-last').value.trim(),
   p_birth_date:birth,p_residence:$('new-residence').value.trim()||null,
   p_phone:$('new-phone').value.trim()||null,p_email:$('new-email').value.trim()||null
  });
  if(error)throw error;
  $('create-member').reset();
  await loadMembers();membersFeedback('Richiesta inserita in attesa. Numero #'+data[0].member_number+'.');
 }catch(error){membersFeedback('Richiesta non registrata: '+error.message);}
 finally{btn.disabled=false;}
});
$('reload-members').addEventListener('click',loadMembers);

async function loadGalleryModeration(){
 const target=$('gallery-admin-list');if(!target||!client)return;
 target.replaceChildren();$('gallery-admin-status').textContent='Caricamento richieste...';
 const {data,error}=await client.rpc('gc_gallery_pending');
 if(error){$('gallery-admin-status').textContent='Gestione galleria non ancora collegata: esegui la migrazione v3 nel SQL Editor. '+error.message;return;}
 if(!data?.length){$('gallery-admin-status').textContent='Nessuna foto in attesa di approvazione.';return;}
 $('gallery-admin-status').textContent=data.length+' fotografie in attesa.';
 for(const photo of data){
  const wrap=document.createElement('div');wrap.className='gallery-admin-item';
  const {data:signature,error:signError}=await client.storage.from('gc-gallery').createSignedUrl(photo.storage_path,600);
  if(signError||!signature?.signedUrl)continue;
  const img=document.createElement('img');img.src=signature.signedUrl;img.alt='Foto inviata da un cliente in attesa di revisione';
  const details=document.createElement('div');const caption=document.createElement('p');caption.textContent=photo.caption||'Senza didascalia';details.append(caption);
  const actions=document.createElement('div');actions.className='actions';
  for(const status of ['approved','rejected']){
   const b=document.createElement('button');b.type='button';b.className=status==='rejected'?'secondary':'';b.textContent=status==='approved'?'Approva foto':'Rifiuta foto';
   b.addEventListener('click',async()=>{
    if(!window.confirm(status==='approved'?'Confermi che questa foto può essere pubblicata?':'Rifiutare questa fotografia?'))return;
    for(const button of actions.querySelectorAll('button'))button.disabled=true;
    const {error:reviewError}=await client.rpc('gc_gallery_review',{p_photo:photo.photo_id,p_status:status});
    if(reviewError){$('gallery-admin-status').textContent=reviewError.message;for(const button of actions.querySelectorAll('button'))button.disabled=false;return;}
    if(status==='rejected'){
      const {error:deleteError}=await client.storage.from('gc-gallery').remove([photo.storage_path]);
      if(deleteError)$('gallery-admin-status').textContent='Rifiutata, ma impossibile cancellare il file: '+deleteError.message;
    }
    await loadGalleryModeration();
   });actions.append(b);
  }
  details.append(actions);wrap.append(img,details);target.append(wrap);
 }
}
$('gallery-admin-refresh').addEventListener('click',loadGalleryModeration);
