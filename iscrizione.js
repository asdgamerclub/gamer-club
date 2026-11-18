'use strict';
const $=id=>document.getElementById(id);
$('year').textContent=new Date().getFullYear();
const today=new Date();
const maxDate=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
$('nascita').max=maxDate;
function update(){const first=$('nome').value.trim();const last=$('cognome').value.trim();$('card-name').textContent=(first+' '+last).trim()||'NOME COGNOME';const val=$('nascita').value;const d=val?new Date(val+'T00:00:00'):null;$('card-dob').textContent=d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d):'-- / -- / ----';}
for(const key of ['nome','cognome','nascita'])$(key).addEventListener('input',update);
$('join').addEventListener('submit',e=>{e.preventDefault();const birth=$('nascita').value;if(!birth||birth>maxDate||birth<'1900-01-01'){$('feedback').textContent='Controlla la data di nascita.';return;}const age=Math.floor((Date.now()-new Date(birth+'T00:00:00'))/(365.2425*86400000));$('feedback').textContent=(age<18?'Card personalizzata. Per i minorenni serve la documentazione del genitore/tutore.':'Card personalizzata. ')+ 'I dati non sono stati inviati. Per richiedere la tessera, rivolgiti alla cassa.';});
