import {heading,escapeHtml} from '../../shared/ui.js';import {icon} from '../../shared/icons.js';
export const styles='<link rel="stylesheet" href="./interno/cadastros/catalog.css"><link rel="stylesheet" href="./interno/cotacao/styles.css">';
export const notice='<div class="catalog-notice">Demonstração frontend: dados fictícios, preços e escolhas somente na memória. Não envia pedidos nem contata fornecedores.</div>';
export const back='<a class="quote-back" href="#cotacao">← Todas as cotações</a>';
export const dateLabel=date=>date.split('-').reverse().join('/');
export {heading,escapeHtml,icon};
