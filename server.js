const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const N8N_WEBHOOK = 'http://localhost:5678/webhook-test/580cc776-e238-483c-ba4d-cc0811d26576';

// =======================
// WHATSAPP CLIENT
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  console.log('Escaneie o QR Code:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('✅ WhatsApp conectado!'));

// =======================
// UTILITÁRIOS
// =======================

function limparNumero(raw = '') {
  return raw.replace(/@.*$/, '').replace(/\D/g, '');
}

function formatarE164(digits = '') {
  return `+${digits}`;
}

/** Resolve o número real evitando IDs LID inválidos */
async function resolverNumero(msg, contact) {
  // 1ª prioridade: contact.id no formato @c.us → número real garantido
  if (contact.id?._serialized?.endsWith('@c.us')) {
    return contact.id.user; // ex: "5511999999999"
  }

  // 2ª prioridade: msg.from no formato @c.us
  if (msg.from?.endsWith('@c.us')) {
    return msg.from.replace('@c.us', '');
  }

  // 3ª prioridade: dígitos disponíveis com validação de tamanho (E.164 = máx 15)
  const digitos = limparNumero(contact.number || msg.from || '');

  if (digitos.length >= 7 && digitos.length <= 15) {
    return digitos;
  }

  console.warn('⚠️  Número possivelmente LID inválido:', digitos);
  return digitos;
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
// RECEBER MENSAGENS
// =======================
client.on('message', async msg => {
  try {
    const contact = await msg.getContact();
    const chat    = await msg.getChat();
    const isGroup = chat.isGroup;

    // ── Número (corrigido para LID) ───────────────────────────
    const numero      = await resolverNumero(msg, contact);
    const numeroE164  = formatarE164(numero);

    // ── Nome ──────────────────────────────────────────────────
    const nome = contact.pushname
              || contact.name
              || contact.shortName
              || 'Desconhecido';

    // ── Grupo ─────────────────────────────────────────────────
    const grupoId   = isGroup ? limparNumero(chat.id._serialized) : null;
    const grupoNome = isGroup ? chat.name : null;

    // ── Mídia ─────────────────────────────────────────────────
    let mediaMime   = null;
    // let mediaBase64 = null; // descomente se precisar enviar o base64

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        mediaMime   = media.mimetype;
        // mediaBase64 = media.data;
      } catch (_) { /* mídia indisponível */ }
    }

    // ── Localização ───────────────────────────────────────────
    let localizacao = null;
    if (msg.type === MessageTypes.LOCATION) {
      localizacao = {
        latitude:  msg.location?.latitude   ?? null,
        longitude: msg.location?.longitude  ?? null,
        descricao: msg.location?.description ?? null,
      };
    }

    // ── Payload ───────────────────────────────────────────────
    const payload = {
      // Identificação
      messageId:     msg.id?.id ?? null,
      timestamp:     msg.timestamp,
      timestampISO:  new Date(msg.timestamp * 1000).toISOString(),

      // Remetente
      numero,                                      // ex: 5511999999999
      numeroE164,                                  // ex: +5511999999999
      nome,
      nomeEmpresarial: contact.businessName || null,
      fotoPerfil:      null,
      // Para tentar buscar a foto (pode falhar por privacidade):
      // fotoPerfil: await client.getProfilePicUrl(msg.from).catch(() => null),

      // Conteúdo
      tipo:      resolverTipo(msg),
      mensagem:  msg.body    || null,
      caption:   msg.caption || null,

      // Mídia
      temMidia:  msg.hasMedia,
      midiaMime: mediaMime,
      // midiaBase64: mediaBase64,

      // Localização
      localizacao,

      // Citação / resposta
      emResposta:       msg.hasQuotedMsg,
      mensagemCitadaId: msg.hasQuotedMsg
                        ? (msg._data?.quotedStanzaID ?? null)
                        : null,

      // Grupo
      isGrupo:   isGroup,
      grupoId,
      grupoNome,

      // Flags
      isMeuContato:     contact.isMyContact,
      isBusiness:       contact.isBusiness,
      isEnterprise:     contact.isEnterprise,
      isEncaminhada:    msg.isForwarded,
      vezesEncaminhada: msg.forwardingScore ?? 0,
      isMencao:         (msg.mentionedIds?.length ?? 0) > 0,
      mencoes:          (msg.mentionedIds ?? []).map(limparNumero),
    };

    console.log('📩 Mensagem recebida:', numero, msg.body);
    await axios.post(N8N_WEBHOOK, payload);
    console.log('📡 Enviado para n8n');

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error.message);
  }
});

client.initialize();

// =======================
// ENVIAR MENSAGEM (n8n → WhatsApp)
// =======================
app.post('/send', async (req, res) => {
  const { numero, mensagem } = req.body;

  if (!numero || !mensagem) {
    return res.status(400).json({ error: 'Campos "numero" e "mensagem" são obrigatórios' });
  }

  try {
    const numeroLimpo = numero.toString().replace(/\D/g, '');
    const numberId    = await client.getNumberId(numeroLimpo);

    if (!numberId) {
      return res.status(404).json({ error: 'Número não encontrado no WhatsApp' });
    }

    const sentMsg = await client.sendMessage(numberId._serialized, mensagem);

    res.json({
      status:    'enviado',
      messageId: sentMsg.id?.id ?? null,
      para:      numeroLimpo,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// STATUS
// =======================
app.get('/status', (req, res) => {
  res.json({
    status:      'online',
    timestamp:   new Date().toISOString(),
    clientReady: client.info?.wid ? true : false,
    telefone:    client.info?.wid?._serialized ?? null,
  });
});

// =======================
// SERVER
// =======================
app.listen(3000, () => console.log('🚀 API rodando na porta 3000'));