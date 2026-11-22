import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.10';
const URL='https://vbymfpijstibabzijahi.supabase.co';
const KEY='sb_publishable_vEyF0m37DUvl0JHre2TDoQ_7v5zPPf9';
const db=createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let member=null,loading=false;
$('year').textContent=new Date().getFullYear();
function status(s,error=false){$('banner').textContent=s;$('banner').className='notice'+(error?' error':'');}
function section(name){for(const k of ['login-panel','link-panel','card-panel'])$(k).hidden=k!==name;}
function readableDate(s){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT');}
async function showCard(){
 const {data,error}=await db.rpc('gc_my_card');if(error)throw error;
 if(!data?.length){section('link-panel');status('Accesso riuscito. Collega la tua tessera se la tua email è registrata al Gamer Club.');return;}
 member=data[0];
 section('card-panel');renderCard(member);await loadRequests();
 const {data:{user}}=await db.auth.getUser();$('account-email').textContent=user?.email||'';
 status('Tessera personale caricata dal database.');
}
async function init(){
 const {data:{session}}=await db.auth.getSession();
 if(!session){section('login-panel');return;}
 try{await showCard();}catch(e){section('login-panel');status('Impossibile caricare la tessera: '+e.message,true);}
}
$('login-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=$('login-button');button.disabled=true;
 try{
  const email=$('email').value.trim();
  const {error}=await db.auth.signInWithOtp({
   email, options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}
  });
  if(error)throw error;
  status('Ti abbiamo inviato un link di accesso. Aprilo dalla tua email (controlla anche Spam).');
 }catch(e){status('Invio email non riuscito: '+e.message,true);}
 finally{button.disabled=false;}
});
$('link-card').addEventListener('click',async()=>{
 const b=$('link-card');b.disabled=true;
 try{const {error}=await db.rpc('gc_claim_my_card');if(error)throw error;await showCard();}
 catch(e){status('Associazione non riuscita: '+e.message,true);}
 finally{b.disabled=false;}
});
for(const b of document.querySelectorAll('.logout'))b.addEventListener('click',async()=>{
 await db.auth.signOut();member=null;section('login-panel');status('Sessione terminata.');
});
function renderCard(m){
 const tier=['gold','silver','blue'].includes(m.tier)?m.tier:'blue';
 $('member-card').className='member-card tier-'+tier;
 const tiers={blue:'BLU',silver:'ARGENTO',gold:'ORO'};
 $('member-name').textContent=m.first_name+' '+m.last_name;
 $('member-number').textContent=String(m.member_number).padStart(6,'0');
 $('points-count').textContent=m.progress+' / 10 PARTITE';
 $('stat-progress').textContent=m.progress+'/10';
 $('stat-available').textContent=m.rewards_available;
 $('stat-redeemed').textContent=m.rewards_redeemed;
 $('stat-tier').textContent=tiers[tier];
 $('tier-label').textContent='GAMER '+tiers[tier];
 $('card-dates').textContent=m.valid_until?'VALIDA FINO AL '+readableDate(m.valid_until):'DAL '+readableDate(m.joined_at);
 $('reward-summary').textContent=m.rewards_available>0?m.rewards_available+' PREMIO/I DISPONIBILI':'Mancano '+(10-m.progress)+' partite';
 const dots=$('point-dots');dots.replaceChildren();
 for(let i=0;i<10;i++){const dot=document.createElement('i');if(i<m.progress)dot.className='on';dots.append(dot);}
 const box=$('qr-box');box.replaceChildren();
 import('https://esm.sh/qrcode@1.5.4').then(({default:QR})=>{
  const canvas=document.createElement('canvas');return QR.toCanvas(canvas,m.qr_token,{margin:1,width:260,errorCorrectionLevel:'M'}).then(()=>box.replaceChildren(canvas));
 }).catch(()=>{box.textContent='QR momentaneamente non disponibile';});
}
async function loadRequests(){
 const {data,error}=await db.rpc('gc_my_point_requests');
 const target=$('request-list');target.replaceChildren();
 if(error){target.textContent='Impossibile leggere le richieste: '+error.message;return;}
 if(!data?.length){target.textContent='Nessuna richiesta inviata.';return;}
 const labels={pending:'In attesa di approvazione',approved:'Approvata',rejected:'Rifiutata'};
 for(const item of data){const row=document.createElement('div');row.className='request-row';
  const date=document.createElement('span');date.textContent=readableDate(item.created_at);
  const label=document.createElement('b');label.textContent=labels[item.status]||item.status;
  row.append(date,label);target.append(row);
 }
}
$('request-point').addEventListener('click',async()=>{
 if(!member||loading)return;
 if(!confirm('Confermi di richiedere un punto per una partita effettivamente pagata e giocata? La cassa dovrà approvarlo.'))return;
 loading=true;$('request-point').disabled=true;
 try{const {error}=await db.rpc('gc_request_paid_game');if(error)throw error;
 $('request-feedback').textContent='Richiesta inviata. Il punto apparirà dopo l’approvazione del personale.';
 await loadRequests();
 }catch(e){$('request-feedback').textContent='Richiesta non inviata: '+e.message;}
 finally{loading=false;$('request-point').disabled=false;}
});
$('refresh').addEventListener('click',()=>showCard().catch(e=>status('Aggiornamento non riuscito: '+e.message,true)));
$('flip').addEventListener('click',()=>{$('back-card').hidden=!$('back-card').hidden;$('flip').textContent=$('back-card').hidden?'Vedi vantaggi':'Nascondi vantaggi';});
db.auth.onAuthStateChange((_event,session)=>{if(session){setTimeout(()=>init(),50);}});
init();
