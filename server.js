// =======================
// IMPORTS
// =======================
const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const express = require('express');
const qrcode  = require('qrcode');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

// =======================
// EXPRESS
// =======================
const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const PORT = 3000;

const N8N_WEBHOOK =
  'https://n8n.srv1709994.hstgr.cloud/webhook/fb429ae1-d3e2-4036-9fe7-e943fd5bd581';

const AUTH_DIR  = path.join(__dirname, '.wwebjs_auth');
const CACHE_DIR = path.join(__dirname, '.wwebjs_cache');

// =======================
// ESTADO GLOBAL
// =======================
let qrCodeString       = null;
let whatsappConectado  = false;
let clientPronto       = false;
let tentativasReconect = 0;
const MAX_TENTATIVAS   = 5;

// =======================
// FUNÇÃO: LIMPA SESSÃO CORROMPIDA
// =======================
function limparSessao() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log('🧹 Sessão antiga removida');
    }
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      console.log('🧹 Cache antigo removido');
    }
  } catch (e) {
    console.error('Erro ao limpar sessão:', e.message);
  }
}

// =======================
// FUNÇÃO: CRIA CLIENT
// =======================
function criarClient() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: AUTH_DIR
    }),

    puppeteer: {
      executablePath: '/snap/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',         // importante em VPS com pouca RAM
        '--disable-extensions'
      ]
    }
  });
}

// =======================
// INICIALIZA CLIENT
// =======================
let client = criarClient();
registrarEventos(client);
client.initialize().catch(err => {
  console.error('❌ Erro ao inicializar:', err.message);
});

// =======================
// REGISTRA EVENTOS
// =======================
function registrarEventos(c) {

  // ── QR ──────────────────────────────────────
  c.on('qr', qr => {
    console.log('📲 Novo QR Code gerado');
    qrCodeString = qr;
    whatsappConectado = false;
    tentativasReconect = 0;
  });

  // ── AUTHENTICATED ────────────────────────────
  c.on('authenticated', () => {
    console.log('🔐 AUTHENTICATED — sessão salva');
    tentativasReconect = 0;
  });

  // ── AUTH FAILURE ─────────────────────────────
  c.on('auth_failure', async msg => {
    console.error('❌ AUTH FAILURE:', msg);
    // Sessão corrompida — limpa e reinicia
    await reconectar(true);
  });

  // ── READY ────────────────────────────────────
  c.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    whatsappConectado = true;
    clientPronto      = true;
    qrCodeString      = null;
    tentativasReconect = 0;
  });

  // ── LOADING SCREEN ───────────────────────────
  c.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${percent}% — ${message}`);
  });

  // ── DISCONNECTED ─────────────────────────────
  c.on('disconnected', async reason => {
    console.warn('❌ WhatsApp desconectado. Motivo:', reason);
    whatsappConectado = false;
    clientPronto      = false;

    // LOGOUT = sessão invalidada pelo celular — precisa limpar
    const precisaLimpar = reason === 'LOGOUT';
    await reconectar(precisaLimpar);
  });

  // ── MENSAGENS ────────────────────────────────
  c.on('message', async msg => {
    await processarMensagem(msg);
  });
}

// =======================
// RECONEXÃO AUTOMÁTICA
// =======================
async function reconectar(limparSessaoAntes = false) {

  if (tentativasReconect >= MAX_TENTATIVAS) {
    console.error(`🚫 Máximo de ${MAX_TENTATIVAS} tentativas atingido. Reinicie manualmente.`);
    return;
  }

  tentativasReconect++;
  const espera = tentativasReconect * 5000; // espera cresce a cada tentativa

  console.log(`🔄 Tentativa ${tentativasReconect}/${MAX_TENTATIVAS} em ${espera / 1000}s...`);

  await sleep(espera);

  try {
    // Destrói o client antigo
    await client.destroy().catch(() => {});
  } catch (_) {}

  if (limparSessaoAntes) {
    limparSessao();
  }

  // Cria e inicializa novo client
  client = criarClient();
  registrarEventos(client);

  client.initialize().catch(err => {
    console.error('❌ Erro ao reinicializar:', err.message);
  });
}

// =======================
// SLEEP
// =======================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =======================
// FUNÇÕES AUXILIARES
// =======================
function limparNumero(raw = '') {
  return raw.replace(/@.*$/, '').replace(/\D/g, '');
}

function formatarE164(digits = '') {
  return `+${digits}`;
}

async function resolverNumero(msg, contact) {
  if (contact.id?._serialized?.endsWith('@c.us')) {
    return contact.id.user;
  }
  if (msg.from?.endsWith('@c.us')) {
    return msg.from.replace('@c.us', '');
  }
  return limparNumero(contact.number || msg.from || '');
}

function resolverTipo(msg) {
  const map = {
    [MessageTypes.TEXT]:               'text',
    [MessageTypes.IMAGE]:              'image',
    [MessageTypes.VIDEO]:              'video',
    [MessageTypes.AUDIO]:              'audio',
    [MessageTypes.VOICE]:              'voice',
    [MessageTypes.DOCUMENT]:           'document',
    [MessageTypes.STICKER]:            'sticker',
    [MessageTypes.LOCATION]:           'location',
    [MessageTypes.CONTACT_CARD]:       'contact',
    [MessageTypes.CONTACT_CARD_MULTI]: 'contact_multi',
    [MessageTypes.LIST]:               'list',
    [MessageTypes.BUTTONS_RESPONSE]:   'button_response',
    [MessageTypes.POLL_CREATION]:      'poll',
  };
  return map[msg.type] || msg.type || 'unknown';
}

// =======================
// PROCESSAR MENSAGEM
// =======================
async function processarMensagem(msg) {
  try {
    const contact = await msg.getContact();
    const chat    = await msg.getChat();
    const isGroup = chat.isGroup;

    const numero = await resolverNumero(msg, contact);
    const nome   =
      contact.pushname  ||
      contact.name      ||
      contact.shortName ||
      'Desconhecido';

    const payload = {
      messageId:    msg.id?.id || null,
      timestamp:    msg.timestamp,
      timestampISO: new Date(msg.timestamp * 1000).toISOString(),
      numero,
      numeroE164:   formatarE164(numero),
      nome,
      tipo:         resolverTipo(msg),
      mensagem:     msg.body || null,
      isGrupo:      isGroup,
      grupoId:      isGroup ? limparNumero(chat.id._serialized) : null,
      grupoNome:    isGroup ? chat.name : null,
      temMidia:     msg.hasMedia
    };

    console.log('📩 Mensagem recebida de', numero);

    // Envia para n8n com retry simples
    let enviado = false;
    for (let i = 0; i < 3; i++) {
      try {
        await axios.post(N8N_WEBHOOK, payload, { timeout: 10000 });
        console.log('📡 Enviado para n8n');
        enviado = true;
        break;
      } catch (e) {
        console.warn(`⚠️ Tentativa ${i + 1} falhou ao enviar para n8n:`, e.message);
        await sleep(2000);
      }
    }

    if (!enviado) {
      console.error('❌ Falha ao enviar para n8n após 3 tentativas');
    }

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error.message);
  }
}

// =======================
// ROTA: QR CODE
// =======================
app.get('/qr', async (req, res) => {
  try {
    if (whatsappConectado) {
      return res.send(htmlSimples('✅ WhatsApp Conectado', '#25d366'));
    }
    if (!qrCodeString) {
      return res.send(htmlSimples('⏳ Aguardando QR Code...', '#f0a500'));
    }
    const qrImage = await qrcode.toDataURL(qrCodeString);
    res.send(`
      <html>
        <head><title>QR Code WhatsApp</title></head>
        <body style="display:flex;justify-content:center;align-items:center;
                     height:100vh;background:#111;font-family:sans-serif;">
          <div style="background:#fff;padding:30px;border-radius:20px;text-align:center;">
            <h2>📲 Escaneie o QR Code</h2>
            <img src="${qrImage}" width="350"/>
            <p style="color:#888;font-size:13px;">Atualiza automaticamente em 30s</p>
          </div>
        </body>
        <script>setTimeout(()=>location.reload(), 30000)</script>
      </html>
    `);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

function htmlSimples(texto, cor) {
  return `
    <html>
      <body style="display:flex;justify-content:center;align-items:center;
                   height:100vh;background:#111;font-family:sans-serif;color:${cor};">
        <h1>${texto}</h1>
      </body>
    </html>
  `;
}

// =======================
// ROTA: STATUS
// =======================
app.get('/status', (req, res) => {
  res.json({
    status:     whatsappConectado ? 'online' : 'offline',
    conectado:  whatsappConectado,
    pronto:     clientPronto,
    telefone:   client.info?.wid?._serialized || null,
    tentativas: tentativasReconect,
    timestamp:  new Date().toISOString()
  });
});

// =======================
// ROTA: ENVIAR MENSAGEM
// =======================
app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;

  if (!numero || !mensagem) {
    return res.status(400).json({
      error: 'Campos "numero" e "mensagem" são obrigatórios'
    });
  }

  if (!clientPronto) {
    return res.status(503).json({
      error: 'WhatsApp ainda não está pronto. Tente novamente em instantes.'
    });
  }

  try {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    const numberId    = await client.getNumberId(numeroLimpo);

    if (!numberId) {
      return res.status(404).json({
        error: 'Número não encontrado no WhatsApp'
      });
    }

    const sentMsg = await client.sendMessage(numberId._serialized, mensagem);

    res.json({
      status:    'enviado',
      para:      numeroLimpo,
      messageId: sentMsg.id?.id || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ROTA: FORÇAR RECONEXÃO (uso manual)
// =======================
app.post('/reconectar', async (req, res) => {
  const { limpar } = req.body;
  tentativasReconect = 0;
  res.json({ message: 'Reconexão iniciada' });
  await reconectar(limpar === true);
});

// =======================
// SERVER
// =======================
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});