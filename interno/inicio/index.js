import {escapeHtml as esc} from '../../shared/ui.js';
import {icon} from '../../shared/icons.js';
import {repository} from '../../shared/repository.js';
import {quotes} from '../cotacao/state.js';
import {hortifrutiRepository} from '../hortifruti/state.js';
import {campaignStore} from '../promocoes/state.js';
import {priceTableStore} from '../tabela-precos/state.js';
import {localToday} from '../calendario/state.js';
import {dailySummary,createNoticeStore} from './state.js';

export async function render(root) {
  const warnings=[];
  const read=(label,fn)=>{try{return fn();}catch{warnings.push(`Não foi possível carregar ${label}.`);return null;}};
  const purchases=read('o hortifruti',()=>hortifrutiRepository.list({status:''}));
  const campaigns=read('as promoções',()=>{if(campaignStore.warning)throw Error();return campaignStore.list();});
  const printing=read('a fila de impressão',()=>priceTableStore.list());
  const summary=dailySummary({quotes,purchases:purchases||[],campaigns:campaigns||[],printRecords:printing||[]});
  if(purchases===null)summary.purchases=null;
  if(campaigns===null)summary.campaigns=null;
  if(printing===null)summary.printing=null;
  let catalog=null;
  const catalogPromise=repository.summary().then(data=>{catalog=data;}).catch(error=>{warnings.push(error.message);});
  if(!root.isConnected)return;
  let storage=null;try{storage=globalThis.localStorage;}catch{}
  const noticeStore=createNoticeStore(storage);
  let notice='',noticeError='';try{notice=noticeStore.read();}catch(error){noticeError=error.message;}
  const metrics=[
    ['quotes','cotacao','Cotações em aberto','Comparar propostas'],
    ['purchases','hortifruti','Hortifruti para conferir','Pesagem e entrada'],
    ['campaigns','promocoes','Promoções a encerrar','Nos próximos 7 dias'],
    ['printing','tabela-precos','Materiais para imprimir','Enviados à impressão']
  ];
  const shortcuts=[['cadastros/produtos','Produtos'],['cadastros/parceiros','Parceiros'],['acougue','Açougue'],['encartes','Encartes']];
  root.innerHTML=`<link rel="stylesheet" href="./interno/inicio/styles.css">
    <div class="dashboard-heading"><div><span class="eyebrow">VISÃO GERAL</span><h1>Início</h1></div><time datetime="${localToday()}">${esc(new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}))}</time></div>
    <section class="daily-banner" aria-labelledby="daily-title"><div class="daily-banner-heading"><h2 id="daily-title">Resumo do dia</h2><a href="#calendario">Abrir calendário ${icon('arrow')}</a></div>
      <div class="daily-metrics">${metrics.map(([key,href,label,helper])=>`<a class="daily-metric" href="#${href}" aria-label="${esc(label)}: ${summary[key]===null?'indisponível':summary[key]}"><span class="daily-metric-top">${icon(href)}${icon('arrow')}</span><strong>${summary[key]===null?'—':String(summary[key]).padStart(2,'0')}</strong><span class="daily-metric-label">${label}</span><small>${helper}</small></a>`).join('')}</div>
    </section>
    <section class="card home-notice" aria-labelledby="notice-title"><span class="home-notice-icon" aria-hidden="true">${icon('calendario')}</span><div class="home-notice-content"><h2 id="notice-title">Aviso da loja</h2><p class="notice-text">${esc(notice||'Adicione um lembrete para a equipe.')}</p><form class="notice-form" hidden><label for="home-notice-text">Mensagem<textarea id="home-notice-text" name="notice" maxlength="240" rows="3" placeholder="Ex.: Conferir os pedidos da feira até as 10h.">${esc(notice)}</textarea></label><div class="notice-form-actions"><button class="button primary" type="submit">Salvar aviso</button><button class="button secondary" type="button" data-cancel-notice>Cancelar</button></div></form><p class="notice-feedback" role="status">${esc(noticeError)}</p></div><button class="button secondary" type="button" data-edit-notice>${notice?'Editar aviso':'Adicionar aviso'}</button></section>
    <div class="home-bottom"><a class="card home-catalog" href="#cadastros/produtos"><span class="home-catalog-icon">${icon('cadastros')}</span><div><span>Produtos cadastrados</span><strong>${catalog?catalog.products:'…'}</strong></div>${icon('arrow')}</a><section class="card home-shortcuts" aria-labelledby="shortcuts-title"><h2 id="shortcuts-title">Acesso rápido</h2><div>${shortcuts.map(([href,label])=>`<a href="#${href}">${icon(href.split('/')[0])}<span>${label}</span>${icon('arrow')}</a>`).join('')}</div></section></div>
    <p class="home-warning" role="status">${esc(warnings.join(' '))}</p>`;
  const form=root.querySelector('.notice-form'),text=root.querySelector('.notice-text'),edit=root.querySelector('[data-edit-notice]'),feedback=root.querySelector('.notice-feedback'),input=form.querySelector('textarea');
  const close=()=>{form.hidden=true;text.hidden=false;edit.hidden=false;edit.focus();};
  edit.onclick=()=>{input.value=notice;form.hidden=false;text.hidden=true;edit.hidden=true;feedback.textContent=noticeError;input.focus();};
  root.querySelector('[data-cancel-notice]').onclick=()=>{close();feedback.textContent=noticeError;};
  form.onsubmit=event=>{event.preventDefault();try{notice=noticeStore.save(input.value);noticeError='';text.textContent=notice||'Adicione um lembrete para a equipe.';edit.textContent=notice?'Editar aviso':'Adicionar aviso';close();feedback.textContent='Aviso salvo.';}catch(error){feedback.textContent=error.message;}};
  await catalogPromise;if(!root.isConnected)return;root.querySelector('.home-catalog strong').textContent=catalog?catalog.products:'—';root.querySelector('.home-warning').textContent=warnings.join(' ');
}
