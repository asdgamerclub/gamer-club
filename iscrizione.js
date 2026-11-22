import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';
const db=createClient('https://vbymfpijstibabzijahi.supabase.co','sb_publishable_vEyF0m37DUvl0JHre2TDoQ_7v5zPPf9',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
$('year').textContent=new Date().getFullYear();
const today=new Date(),maxDate=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
$('nascita').max=maxDate;
const draftKey='gc_signup_draft_v1',fields=['nome','cognome','nascita','residenza','telefono','email'];
let user=null,busy=false;
function message(s,err=false){$('feedback').textContent=s;$('feedback').style.color=err?'#ffb6b6':'#a8ddff';}
function preview(){const first=$('nome').value.trim(),last=$('cognome').value.trim();$('card-name').textContent=(first+' '+last).trim()||'NOME COGNOME';const d=$('nascita').value?new Date($('nascita').value+'T00:00:00'):null;$('card-dob').textContent=d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('it-IT').format(d):'-- / -- / ----';}
for(const field of ['nome','cognome','nascita'])$(field).addEventListener('input',preview);
function storeDraft(){try{const obj={};for(const k of fields)obj[k]=$(k).value;sessionStorage.setItem(draftKey,JSON.stringify(obj));}catch{}}
function restoreDraft(){try{const x=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(x)for(const k of fields)if(typeof x[k]==='string')$(k).value=x[k];}catch{}preview();}
async function init(){
 restoreDraft();
 const {data}=await db.auth.getUser();user=data?.user||null;
 if(!user){$('submit-request').textContent='Verifica email e invia richiesta';return;}
 const {data:existing,error}=await db.rpc('gc_online_request_status');
 if(!error&&existing?.length){
  const item=existing[0],names={pending:'in attesa di approvazione',active:'approvata',suspended:'sospesa',expired:'scaduta'};
  $('registration-state').textContent='La tua richiesta n. '+item.member_number+' risulta '+(names[item.request_status]||item.request_status)+'.';
  $('submit-request').disabled=true;$('submit-request').textContent='Richiesta già registrata';
  sessionStorage.removeItem(draftKey);
  message('Non occorre registrarsi di nuovo. Quando la tessera è attiva, accedi da tessera.html.');return;
 }
 $('email').value=user.email||'';
 $('email').readOnly=true;
 $('registration-state').textContent='Email verificata: '+(user.email||'')+'. Compila il modulo e premi Invio richiesta.';
 $('submit-request').textContent='Invia richiesta di iscrizione';
}
$('join').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const date=$('nascita').value,first=$('nome').value.trim(),last=$('cognome').value.trim(),email=$('email').value.trim().toLowerCase();
 if(!date||date>maxDate||date<'1900-01-01'){message('Controlla la data di nascita.',true);return;}
 if(!first||!last||!email){message('Compila nome, cognome ed email.',true);return;}
 busy=true;const button=$('submit-request');button.disabled=true;
 try{
  if(!user){
   storeDraft();
   const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
   if(error)throw error;
   $('registration-state').textContent='Controlla la tua email. La richiesta NON è ancora stata inviata: apri il link e premi nuovamente il pulsante.';
   message('Ti abbiamo inviato un link email. Aprilo sullo stesso dispositivo per completare la richiesta.');
  }else{
   if((user.email||'').toLowerCase()!==email)throw Error('L’email deve corrispondere a quella verificata.');
   const {data,error}=await db.rpc('gc_online_request_membership',{
    p_first_name:first,p_last_name:last,p_birth_date:date,
    p_residence:$('residenza').value.trim()||null,p_phone:$('telefono').value.trim()||null
   });
   if(error)throw error;
   sessionStorage.removeItem(draftKey);
   const number=data?.[0]?.member_number;
   $('registration-state').textContent='Richiesta registrata: IN ATTESA DI APPROVAZIONE.';
   message('Richiesta inviata! '+(number?'Numero pratica: '+number+'. ':'')+'Il personale del Gamer Club dovrà approvarla per attivare la tessera.');
   button.textContent='Richiesta inviata';return;
  }
 }catch(error){
  const s=error?.message||'Errore sconosciuto';
  message(/gc_online_request_membership|schema cache|function .*not found/i.test(s)?'Registrazione non ancora attiva nel database: esegui migrazione v6.':'Richiesta non completata: '+s,true);
 }finally{busy=false;if(button.textContent!=='Richiesta inviata'&&button.textContent!=='Richiesta già registrata')button.disabled=false;}
});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session?.user){user=session.user;setTimeout(init,50);}});
init();
