# Axion Muscle + GasparzinhoPay (Render)

Projeto inicial completo com storefront responsiva, backend Node/Express, PostgreSQL e checkout PIX. O visual usa preto, vermelho e branco. O backend é a única parte que usa a chave privada.

## O que está incluído

- `server.js`: API, criação de pedido, chamada `POST /api/v1/create-pix`, consulta de status e webhook.
- `public/index.html`, `public/styles.css`, `public/script.js`: loja e checkout.
- `render.yaml`: modelo de serviço Render + PostgreSQL.
- `.env.example`: variáveis necessárias; nunca coloque a chave real neste arquivo versionado.

## Antes de publicar

1. **Confirme os preços e produtos.** O código usa Axion Muscle R$ 39,90, e-book R$ 19,90 e combo R$ 69,90, conforme informado anteriormente. O combo atualmente custa mais que os itens separados (R$ 59,80); corrija o preço ou explique uma diferença real antes de vender.
2. O e-book precisa estar pronto e sua entrega digital precisa ser configurada. O código não entrega automaticamente um arquivo digital.
3. Confirme no rótulo e com os responsáveis técnicos as informações legais do suplemento. A página evita promessas de emagrecimento garantido.
4. Crie um repositório GitHub privado ou público conforme sua preferência e envie estes arquivos para a raiz do repositório. Não envie `.env` nem chaves.
5. No Render, crie um Blueprint a partir do repositório que contém `render.yaml`, ou crie um Web Service Node e um PostgreSQL manualmente.
6. Configure as variáveis privadas `GASPARZINHOPAY_API_KEY`, `WEBHOOK_SECRET` e `CORS_ORIGINS` no Render. Para `CORS_ORIGINS`, informe a origem exata do frontend se ele estiver hospedado separadamente; se a loja for servida pelo próprio Render, deixe em branco.
7. Não use a chave de exemplo `gp_live_SUA_CHAVE_AQUI` para cobranças reais. Solicite uma chave real ao provedor.
8. Configure o webhook do provedor para `https://SEU-SERVICO.onrender.com/api/webhook/gasparzinhopay`.

## Bloqueio de produção: confirme a documentação oficial da GasparzinhoPay

O material fornecido mostra `data.copyPaste`, mas não confirma o campo de ID da transação, assinatura do webhook, cabeçalhos de autenticação, regras de reenvio, nem o significado operacional de `transactionType: DEPOSITO`. Este código exige um identificador retornado em `data.transactionId`, `data.transaction_id` ou `data.id`, e exige que o webhook inclua `X-Webhook-Secret` igual ao `WEBHOOK_SECRET` configurado.

**Não habilite pagamentos reais até a GasparzinhoPay confirmar esses campos e se é possível configurar esse cabeçalho secreto.** Se o provedor usa assinatura HMAC ou outro mecanismo, substitua a validação do webhook pela validação oficial documentada. Não remova a autenticação do webhook para “fazer funcionar”.

## Executar localmente

Requer Node.js 20+ e PostgreSQL.

```bash
npm install
cp .env.example .env
# Edite .env com DATABASE_URL e variáveis de teste fornecidas pelo provedor
npm start
```

Abra `http://localhost:3000`. Sem banco de dados e chave real/teste, o checkout permanece desativado intencionalmente.

## Endpoints

- `GET /api/health` — saúde do serviço e banco.
- `GET /api/products` — lista de produtos e preços definidos no servidor.
- `POST /api/checkout` — cria pedido e cobrança PIX.
- `GET /api/orders/:id` — status público mínimo do pedido.
- `POST /api/webhook/gasparzinhopay` — webhook autenticado e com validação do valor.

## Observações de segurança

- Preços são definidos no servidor, não enviados pelo navegador.
- A chave privada nunca é entregue ao frontend.
- O webhook exige autenticação, valida ID da transação e valor antes de marcar PAID.
- O CPF/CNPJ é enviado à API para criar o PIX e não é salvo na tabela de pedidos.
- Antes da produção, implemente os requisitos de privacidade, termos, política de reembolso, atendimento, entrega física, entrega digital e regras de proteção de dados aplicáveis.
