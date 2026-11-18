'use strict';
const $=id=>document.getElementById(id);
$('year').textContent=new Date().getFullYear();
const today=new Date();
const maxDate=today.toLocaleDateString('en-CA');
$('nascita').max=maxDate;
function update(){const first=$('nome').value.trim();const last=$('cognome').value.trim();$('card-name').textContent=(first+' '+last).trim()||'NOME COGNOME';const val=$('nascita').value;const d=val?new Date(val+'T00:00:00'):null;$('card-dob').textContent=d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d):'-- / -- / ----';}
for(const key of ['nome','cognome','nascita'])$(key).addEventListener('input',update);
$('join').addEventListener('submit',e=>{e.preventDefault();const birth=$('nascita').value;if(!birth||birth>maxDate||birth<'1900-01-01'){$('feedback').textContent='Controlla la data di nascita.';return;}const age=Math.floor((Date.now()-new Date(birth+'T00:00:00'))/(365.2425*86400000));$('feedback').textContent=(age<18?'Anteprima completata. Per i minorenni la procedura reale richiederà una verifica del genitore/tutore.':'Anteprima completata. ')+ 'Nessun dato è stato inviato o salvato. La richiesta reale non è ancora attiva.';});
