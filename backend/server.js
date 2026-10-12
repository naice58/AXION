require('dotenv').config();
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
            message: "API Axion Muscle online"
              });
              });

const PORT = Number(process.env.PORT || 3000);

const API_BASE = (
  process.env.GASPARZINHOPAY_BASE_URL ||
    'https://gasparzinhopay.com/api/v1'
    ).replace(/\/+$/, '');
const API_KEY = process.env.GASPARZINHOPAY_API_KEY || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

// Prices are authoritative on the server; never trust prices sent by the browser.
const PRODUCTS = Object.freeze({
  suplemento: { id: 'suplemento', name: 'Axion Muscle', description: 'Suplemento — confira o rótulo e as instruções do fabricante.', priceCents: 3990, kind: 'physical' },
  ebook: { id: 'ebook', name: 'E-book Axion: Guia de treino e alimentação', description: 'Produto digital. O conteúdo precisa estar pronto antes de vender.', priceCents: 1990, kind: 'digital' },
  combo: { id: 'combo', name: 'Combo Axion Muscle + E-book', description: 'Suplemento + e-book. Confirme que o preço e os itens do combo estão corretos.', priceCents: 6990, kind: 'combo' }
});

if (!DATABASE_URL) console.warn('AVISO: DATABASE_URL não configurada. O servidor não inicializará sem PostgreSQL.');
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }) : null;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (!allowedOrigins.length || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static('public'));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

async function initDb() {
  if (!pool) throw new Error('DATABASE_URL não configurada');
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    provider_transaction_id TEXT UNIQUE,
    pix_copy_paste TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC)');
}

function cleanString(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function money(cents) { return (cents / 100).toFixed(2); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

app.get('/api/health', async (_req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, message: 'Banco de dados não configurado.' });
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (_e) { res.status(503).json({ ok: false, message: 'Banco de dados indisponível.' }); }
});

app.get('/api/products', (_req, res) => {
  res.json(Object.values(PRODUCTS).map(p => ({ id: p.id, name: p.name, description: p.description, amount: money(p.priceCents) })));
});

app.post('/api/checkout', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Checkout indisponível: banco de dados ainda não configurado.' });
  if (!API_KEY || API_KEY === 'gp_live_SUA_CHAVE_AQUI') {
    return res.status(503).json({ error: 'Checkout em modo de configuração. Adicione a chave real da GasparzinhoPay nas variáveis privadas do Render.' });
  }
  const productId = cleanString(req.body?.productId, 30);
  const product = PRODUCTS[productId];
  const customerName = cleanString(req.body?.customerName, 100);
  const customerEmail = cleanString(req.body?.customerEmail, 160);
  const payerDocument = String(req.body?.payerDocument || '').replace(/\D/g, '');
  if (!product) return res.status(400).json({ error: 'Produto inválido.' });
  if (customerName.length < 2) return res.status(400).json({ error: 'Informe seu nome completo.' });
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (payerDocument.length !== 11 && payerDocument.length !== 14) return res.status(400).json({ error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido em quantidade de dígitos.' });

  const orderId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO orders (id, product_id, product_name, amount_cents, customer_name, customer_email) VALUES ($1,$2,$3,$4,$5,$6)',
    [orderId, product.id, product.name, product.priceCents, customerName, customerEmail || null]
  );

  try {
    const response = await fetch(`${API_BASE}/create-pix`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(money(product.priceCents)),
        payerName: customerName,
        payerDocument,
        description: `Pedido Axion Muscle ${orderId.slice(0, 8)} — ${product.name}`
      }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('GasparzinhoPay create-pix HTTP status:', response.status);
      await pool.query("UPDATE orders SET status='ERROR' WHERE id=$1", [orderId]);
      return res.status(502).json({ error: 'A operadora de pagamento não conseguiu criar a cobrança. Tente novamente mais tarde.' });
    }
    const data = body?.data || {};
    const copyPaste = data.copyPaste || data.copy_paste || data.pixCopyPaste;
    const transactionId = data.transactionId || data.transaction_id || data.id;
    if (typeof copyPaste !== 'string' || !copyPaste.trim() || !transactionId) {
      console.error('Resposta create-pix sem os campos esperados. Confirme o esquema oficial com o provedor.');
      await pool.query("UPDATE orders SET status='ERROR' WHERE id=$1", [orderId]);
      return res.status(502).json({ error: 'A resposta da operadora não contém todos os dados esperados do PIX. A cobrança não pode ser exibida com segurança.' });
    }
    await pool.query('UPDATE orders SET provider_transaction_id=$1, pix_copy_paste=$2 WHERE id=$3', [String(transactionId), copyPaste, orderId]);
    res.status(201).json({ orderId, productName: product.name, amount: money(product.priceCents), copyPaste, status: 'PENDING' });
  } catch (error) {
    console.error('Falha de comunicação com o provedor:', error.name || 'Error');
    await pool.query("UPDATE orders SET status='ERROR' WHERE id=$1", [orderId]).catch(() => {});
    res.status(502).json({ error: 'Não foi possível comunicar com a operadora de pagamento. Tente novamente.' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado.' });
  const id = cleanString(req.params.id, 60);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Pedido inválido.' });
  const result = await pool.query('SELECT id, product_name, amount_cents, status, created_at, paid_at FROM orders WHERE id=$1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const order = result.rows[0];
  res.json({ orderId: order.id, productName: order.product_name, amount: money(order.amount_cents), status: order.status, createdAt: order.created_at, paidAt: order.paid_at });
});

// Security note: this header check is only usable if GasparzinhoPay supports configuring
// a custom webhook header. If it uses HMAC/signatures, implement its documented algorithm instead.
app.post('/api/webhook/gasparzinhopay', async (req, res) => {
  if (!pool) return res.sendStatus(503);
  if (!WEBHOOK_SECRET || !safeEqual(req.get('x-webhook-secret'), WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Webhook não autenticado.' });
  }
  const event = req.body || {};
  const transactionId = cleanString(event.transactionId, 180);
  const status = cleanString(event.status, 40).toUpperCase();
  const transactionType = cleanString(event.transactionType, 40).toUpperCase();
  const value = Number(event.value);
  if (!transactionId || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'Evento incompleto.' });

  const found = await pool.query('SELECT id, amount_cents, status FROM orders WHERE provider_transaction_id=$1', [transactionId]);
  if (!found.rowCount) return res.status(404).json({ error: 'Transação não corresponde a um pedido conhecido.' });
  const order = found.rows[0];
  if (Math.round(value * 100) !== order.amount_cents) return res.status(400).json({ error: 'Valor da transação não corresponde ao pedido.' });
  if (status === 'COMPLETO' && transactionType === 'DEPOSITO') {
    await pool.query("UPDATE orders SET status='PAID', paid_at=COALESCE(paid_at,NOW()) WHERE id=$1", [order.id]);
  } else if (['CANCELADO', 'CANCELADA', 'EXPIRADO', 'FALHOU', 'RECUSADO'].includes(status)) {
    await pool.query("UPDATE orders SET status='FAILED' WHERE id=$1 AND status <> 'PAID'", [order.id]);
  }
  res.json({ received: true });
});

app.get('*', (_req, res) => res.sendFile(require('node:path').join(process.cwd(), 'public', 'index.html')));

initDb().then(() => {
  app.listen(PORT, () => console.log(`Axion backend ativo na porta ${PORT}`));
}).catch(error => {
  console.error('Não foi possível iniciar. Verifique DATABASE_URL e a conexão PostgreSQL.');
  console.error(error.message);
  process.exit(1);
});
