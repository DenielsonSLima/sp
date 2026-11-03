// Explicit legacy fixtures for regression tests only. Never imported by the application.
import {addDays, localToday} from './calendar-state.js';

export function dailySummary({quotes=[], purchases=[], campaigns=[], printRecords=[], today=localToday()}={}) {
  const lastDay=addDays(today, 7);
  return {
    quotes:quotes.filter(item=>item.status==='open').length,
    purchases:purchases.filter(item=>item.status==='pending'&&!item.entryConfirmed).length,
    campaigns:campaigns.filter(item=>item.start<=today&&item.end>=today&&item.end<=lastDay).length,
    printing:printRecords.filter(item=>item.status==='sent'&&!item.archivedAt).length
  };
}

export const NOTICE_KEY='supermercado-home-notice-v1';
export function createNoticeStore(storage) {
  let baseline;
  return {
    read() {
      if(!storage)throw Error('O navegador não permite salvar o aviso.');
      const raw=storage.getItem(NOTICE_KEY);
      let text='';
      if(raw!==null){let value;try{value=JSON.parse(raw);}catch{throw Error('Não foi possível ler o aviso salvo.');}
        if(value?.version!==1||typeof value.text!=='string'||value.text.length>240)throw Error('Não foi possível ler o aviso salvo.');
        text=value.text;
      }
      baseline=raw;
      return text;
    },
    save(value) {
      if(!storage)throw Error('O navegador não permite salvar o aviso.');
      const text=String(value).trim();
      if(text.length>240)throw Error('Use até 240 caracteres no aviso.');
      if(baseline===undefined)throw Error('Recarregue a página antes de salvar o aviso.');
      if(storage.getItem(NOTICE_KEY)!==baseline)throw Error('O aviso mudou em outra aba. Recarregue antes de salvar.');
      const raw=JSON.stringify({version:1,text,updatedAt:new Date().toISOString()});
      try{storage.setItem(NOTICE_KEY,raw);}catch{throw Error('Não foi possível salvar o aviso. Verifique o espaço e a permissão do navegador.');}
      baseline=raw;
      return text;
    }
  };
}
