import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const $ = id => document.getElementById(id);
$('gallery-year').textContent = String(new Date().getFullYear());
const stored = (() => { try { return JSON.parse(localStorage.getItem('gc_admin_public_config_v1') || 'null'); } catch { return null; }})();
const cfg = window.GC_GALLERY_CONFIG || {};
const url = cfg.url || stored?.url || '';
const key = cfg.publishableKey || stored?.key || '';
const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url);
const okKey = /^(sb_publishable_|eyJ)/.test(key) && !/^(sb_secret_|sb_service_role_)/.test(key);
const enabled = okUrl && okKey;
let client = null, currentUser = null, previewUrl = null;

const setFeedback = (message) => { $('gallery-feedback').textContent = message; };
const setStatus = (message) => { $('gallery-status').textContent = message; };
const empty = (heading, description) => {
  const el = document.createElement('div'); el.className = 'gallery-empty';
  const h = document.createElement('h3');h.textContent=heading;
  const p = document.createElement('p');p.textContent=description;
  el.append(h,p);$('gallery-grid').replaceChildren(el);
};

async function loadPhotos(){
  if(!client){empty('I tuoi momenti gaming','Le fotografie condivise dalla community compariranno in questa galleria dopo l’approvazione.');setStatus('Caricamento delle nuove foto non ancora disponibile.');return;}
  setStatus('Caricamento foto…');
  const {data,error}=await client.from('gc_gallery').select('id,storage_path,caption,created_at').eq('status','approved').order('created_at',{ascending:false}).limit(60);
  if(error){empty('Galleria in aggiornamento','Stiamo predisponendo la raccolta fotografica.');setStatus('Non è stato possibile leggere la galleria: '+error.message);return;}
  if(!data?.length){empty('LA PRIMA FOTO PUÒ ESSERE LA TUA.','Condividi una sfida, un torneo o una serata con gli amici. Le immagini appaiono qui dopo la verifica.');setStatus('Nessuna fotografia pubblicata.');return;}
  $('gallery-grid').replaceChildren();
  let added=0;
  for(const item of data){
    const {data:signed,error:signError}=await client.storage.from('gc-gallery').createSignedUrl(item.storage_path,1800);
    if(signError||!signed?.signedUrl)continue;
    const fig=document.createElement('figure');
    const img=document.createElement('img');img.src=signed.signedUrl;img.alt=item.caption||'Fotografia della community Gamer Club';img.loading='lazy';
    img.addEventListener('click',()=>openPhoto(signed.signedUrl,img.alt));
    fig.append(img);
    if(item.caption){const caption=document.createElement('figcaption');caption.textContent=item.caption;fig.append(caption);}
    $('gallery-grid').append(fig);
    added++;
  }
  if(!added){empty('Nessuna foto disponibile','Le fotografie sono temporaneamente indisponibili.');setStatus('Impossibile caricare i file.');return;}
  setStatus(added+' foto nella galleria.');
}

function openPhoto(src,alt){
  const dialog=document.createElement('dialog');dialog.className='gallery-image-dialog';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Chiudi fotografia');
  const img=document.createElement('img');img.src=src;img.alt=alt;
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.append(close,img);document.body.append(dialog);dialog.showModal();
}

function renderUser(){
  $('gallery-user').hidden=!currentUser;
  $('gallery-login').hidden=!!currentUser || !enabled;
  $('gallery-photo-form').hidden=!currentUser;
  if(currentUser)$('gallery-who').textContent='Accesso attivo: '+(currentUser.email||'utente');
}

async function refreshUser(){
  if(!client)return;
  const {data:{user}}=await client.auth.getUser();
  currentUser=user;renderUser();
}

$('gallery-refresh').addEventListener('click',loadPhotos);

if(enabled){
  client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;renderUser();});
  refreshUser().catch(e=>setFeedback(e.message));
  loadPhotos();
}else{
  $('gallery-login').hidden=true;$('gallery-photo-form').hidden=true;
  $('gallery-connection').hidden=false;
  setFeedback('L’accesso per inviare foto sarà disponibile al completamento della configurazione.');
  loadPhotos();
}

$('gallery-email-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!client)return;
  const submit=e.submitter;submit.disabled=true;
  try{
    const {error}=await client.auth.signInWithOtp({email:$('gallery-email').value.trim(),options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
    if(error)throw error;
    setFeedback('Ti abbiamo richiesto un link di accesso. Controlla la posta e apri il link su questo dispositivo.');
  }catch(error){setFeedback('Invio non riuscito: '+error.message);}
  finally{submit.disabled=false;}
});

$('gallery-password-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!client)return;
  const submit=e.submitter;submit.disabled=true;
  try{
    const {error}=await client.auth.signInWithPassword({email:$('gallery-operator-email').value.trim(),password:$('gallery-password').value});
    $('gallery-password').value='';
    if(error)throw error;
    await refreshUser();
    setFeedback('Accesso effettuato. Puoi inviare fotografie.');
  }catch(error){setFeedback('Accesso non riuscito: '+error.message);}
  finally{submit.disabled=false;}
});

$('gallery-signout').addEventListener('click',async()=>{
  if(!client)return;
  await client.auth.signOut();currentUser=null;renderUser();setFeedback('Hai effettuato la disconnessione.');
});

$('gallery-photo').addEventListener('change',()=>{
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  const file=$('gallery-photo').files?.[0];
  if(!file){$('gallery-preview').hidden=true;return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4194304){setFeedback('La foto deve essere JPG, PNG o WEBP e non superare 4 MB.');$('gallery-photo').value='';$('gallery-preview').hidden=true;return;}
  previewUrl=URL.createObjectURL(file);
  $('gallery-preview').src=previewUrl;$('gallery-preview').hidden=false;setFeedback('');
});

async function normalizePhoto(file){
  const bitmap=await createImageBitmap(file);
  const max=1920,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const context=canvas.getContext('2d');if(!context)throw Error('Questo dispositivo non può elaborare la foto');
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.86));
  if(!blob)throw Error('Impossibile preparare la foto');
  if(blob.size>4194304)throw Error('La foto elaborata supera 4 MB');
  return blob;
}

$('gallery-photo-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!client||!currentUser)return;
  const file=$('gallery-photo').files?.[0];
  if(!file){setFeedback('Seleziona una fotografia.');return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4194304){setFeedback('Sono accettate foto JPG, PNG o WEBP fino a 4 MB.');return;}
  if(!$('gallery-consent').checked){setFeedback('È necessaria la dichiarazione sui diritti e le autorizzazioni.');return;}
  const submit=$('gallery-submit');submit.disabled=true;setFeedback('Preparazione e caricamento della fotografia…');
  try{
    const blob=await normalizePhoto(file);
    const path=currentUser.id+'/'+crypto.randomUUID()+'.webp';
    const uploaded=await client.storage.from('gc-gallery').upload(path,blob,{contentType:'image/webp',upsert:false});
    if(uploaded.error)throw uploaded.error;
    const {error}=await client.rpc('gc_gallery_submit',{p_storage_path:path,p_caption:$('gallery-caption').value.trim(),p_authorized:true});
    if(error)throw error;
    $('gallery-photo-form').reset();$('gallery-preview').hidden=true;
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    setFeedback('Foto inviata correttamente. Verrà pubblicata nella galleria dopo la verifica del personale.');
  }catch(error){setFeedback('Impossibile inviare la foto: '+error.message);}
  finally{submit.disabled=false;}
});
