const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#main-nav');
menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));
document.querySelector('#year').textContent = new Date().getFullYear();

// A gateway está temporariamente indisponível. Não inserir links ou endpoints inventados.
// Quando a equipe fornecer a documentação, integrar no servidor e validar pagamentos por webhook.
document.querySelector('#buy-button')?.addEventListener('click', () => {
  const status = document.querySelector('#checkout-status');
  status.textContent = 'O checkout ainda não está disponível. A integração será habilitada após recebermos a documentação da gateway e concluir os testes de segurança.';
  status.classList.add('status-highlight');
});
const legalContent = {
  privacy: { title: 'Política de privacidade — rascunho', text: 'Este aviso ainda não é uma política completa. Antes do lançamento, informe quem é o controlador dos dados, quais dados são coletados, finalidades, bases legais, compartilhamentos, prazos de retenção, direitos dos titulares e canais de contato. Descreva também cookies e ferramentas de análise ou publicidade que forem realmente utilizadas.' },
  terms: { title: 'Termos de compra — rascunho', text: 'Antes de vender, publique termos completos com identificação do vendedor, descrição e formato do produto, preço final, entrega, suporte, regras de cancelamento e reembolso aplicáveis e canais de atendimento. Revise os requisitos legais brasileiros antes de publicar.' }
};
const dialog = document.querySelector('#legal-dialog');
document.querySelectorAll('[data-legal]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault(); const item = legalContent[link.dataset.legal];
  document.querySelector('#legal-title').textContent = item.title;
  document.querySelector('#legal-copy').textContent = item.text; dialog.showModal();
}));
document.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
