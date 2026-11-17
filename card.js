'use strict';
const key='gamerclub_card_demo_v1';
const initial=()=>({totalPaid:0,redeemed:0});
function readDemo(){try{const d=JSON.parse(localStorage.getItem(key));if(d&&Number.isSafeInteger(d.totalPaid)&&d.totalPaid>=0&&Number.isSafeInteger(d.redeemed)&&d.redeemed>=0&&d.redeemed<=Math.floor(d.totalPaid/10))return d;}catch(_){}return initial();}
let state=readDemo();
const $=id=>document.getElementById(id);
function render(){const earned=Math.floor(state.totalPaid/10);$('progress-text').textContent=(state.totalPaid%10)+' / 10';$('progress-bar').style.width=((state.totalPaid%10)*10)+'%';$('available').textContent=earned-state.redeemed;$('redeemed').textContent=state.redeemed;$('redeem').disabled=earned-state.redeemed===0;localStorage.setItem(key,JSON.stringify(state));}
$('add').addEventListener('click',()=>{const old=Math.floor(state.totalPaid/10);state.totalPaid++;$('message').textContent=Math.floor(state.totalPaid/10)>old?'Premio di prova generato: partita gratuita per 2 giocatori.':'Partita di prova registrata.';render();});
$('redeem').addEventListener('click',()=>{if(Math.floor(state.totalPaid/10)-state.redeemed<1)return;state.redeemed++;$('message').textContent='Premio di prova riscattato.';render();});
$('reset').addEventListener('click',()=>{state=initial();$('message').textContent='Dati di prova azzerati.';render();});
$('year').textContent=new Date().getFullYear();render();