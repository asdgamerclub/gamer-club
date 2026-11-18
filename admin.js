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
async function verify(){const {data:{user},error}=await client.auth.getUser();if(error||!user){show('login');return;}const {data, error:opError}=await client.rpc('gc_is_operator');if(opError||data!==true){await client.auth.signOut();selected=null;show('login');notice('Account non autorizzato come operatore.','error');return;}show('dashboard');notice('Accesso operatore autorizzato.','success');}
async function init(){const c=config();if(!c){show('setup');return}try{useConfig(c);$('url').value=c.url;$('key').value=c.key;await verify();}catch(e){show('setup');notice(e.message,'error');}}
$('config-form').addEventListener('submit',async e=>{e.preventDefault();try{const c=useConfig({url:$('url').value.trim(),key:$('key').value.trim()});localStorage.setItem(store,JSON.stringify(c));notice('Configurazione pubblica salvata in questo browser. Ora accedi.');await verify();}catch(err){notice(err.message,'error');}});
$('change').addEventListener('click',async()=>{if(client)await client.auth.signOut();client=null;selected=null;show('setup');});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;if(b)b.disabled=true;try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(error)throw error;await verify();}catch(err){notice('Accesso non riuscito: '+err.message,'error');}finally{if(b)b.disabled=false;}});
$('logout').addEventListener('click',async()=>{await client.auth.signOut();selected=null;lastToken=null;show('login');notice('Sessione terminata.');});
async function lookup(token){const {data,error}=await client.rpc('gc_member_by_qr',{p_token:token});if(error)throw error;const member=Array.isArray(data)?data[0]:null;if(!member)throw Error('Nessun socio trovato con questo token.');selected=member;lastToken=token;$('member-name').textContent=member.first_name+' '+member.last_name;$('member-number').textContent='Socio n. '+member.member_number;$('member-status').textContent=member.status;$('progress').textContent=member.progress+' / 10';$('available').textContent=member.rewards_available;$('redeemed').textContent=member.rewards_redeemed;$('member').hidden=false;$('qr-output').hidden=true;$('qr-output').replaceChildren();$('qr-show').hidden=false;$('qr-hide').hidden=true;$('add').disabled=member.status!=='active';$('redeem').disabled=member.status!=='active'||member.rewards_available<1;}
$('search-form').addEventListener('submit',async e=>{e.preventDefault();const token=$('token').value.trim();selected=null;$('member').hidden=true;if(!uuid.test(token)){notice('Token QR non valido: occorre un UUID.','error');return;}try{await lookup(token);notice('Socio identificato. Verifica identità e stato prima di procedere.','success');}catch(err){notice(err.message,'error');}});
async function record(kind){if(!selected||!lastToken)return;const name=selected.first_name+' '+selected.last_name;const action=kind==='paid_game'?'Aggiungere 1 partita pagata':'Riscattare 1 premio per due giocatori';if(!window.confirm(action+' per '+name+'?'))return;for(const id of ['add','redeem'])$(id).disabled=true;try{const {error}=await client.rpc('gc_record_event',{p_member:selected.member_id,p_kind:kind});if(error)throw error;await lookup(lastToken);notice(kind==='paid_game'?'Partita registrata nel database.':'Premio riscattato e registrato nel database.','success');}catch(err){notice('Operazione non eseguita: '+err.message,'error');await lookup(lastToken).catch(()=>{$('member').hidden=true;});}}
$('add').addEventListener('click',()=>record('paid_game'));$('redeem').addEventListener('click',()=>record('reward_redeemed'));
init();

async function stopScanner(){if(scannerTimer){clearInterval(scannerTimer);scannerTimer=null;}if(scannerStream){for(const track of scannerStream.getTracks())track.stop();scannerStream=null;}const v=$('scan-video');v.srcObject=null;$('scanner').hidden=true;$('scan-stop').hidden=true;$('scan-start').hidden=false;scannerBusy=false;}
$('scan-start').addEventListener('click',async()=>{
 if(!('BarcodeDetector' in window)){notice('Questo browser non supporta la lettura QR integrata. Usa Chrome o Edge aggiornato, oppure incolla il token manualmente.','error');return;}
 try{
  const detector=new BarcodeDetector({formats:['qr_code']});
  scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  $('scan-video').srcObject=scannerStream;
  await $('scan-video').play();$('scanner').hidden=false;$('scan-start').hidden=true;$('scan-stop').hidden=false;
  notice('Fotocamera attiva: inquadra il QR del socio.');
  scannerTimer=setInterval(async()=>{
   if(scannerBusy||$('scan-video').readyState<2)return;
   scannerBusy=true;
   try{
    const codes=await detector.detect($('scan-video'));
    const found=codes.map(x=>(x.rawValue||'').trim()).find(x=>uuid.test(x));
    if(found){await stopScanner();$('token').value=found;$('search-form').requestSubmit();}
   }catch(e){/* La scansione può fallire sui singoli fotogrammi. */}
   finally{scannerBusy=false;}
  },450);
 }catch(e){await stopScanner();notice('Impossibile aprire la fotocamera: '+e.message,'error');}
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
