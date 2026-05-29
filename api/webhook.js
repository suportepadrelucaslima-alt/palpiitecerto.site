const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Mapeamento: ID do produto na Kiwify → ID interno do sistema
// ATENÇÃO: Preencher com os IDs reais após primeiro webhook chegar nos logs
const PRODUTO_MAP = {};

// Fallback por nome do produto (case-insensitive)
function mapearPorNome(nome) {
  if (!nome) return null;
  const n = nome.toLowerCase();
  if (n.includes('nossa senhora') || n.includes('novena') || n.includes('desatadora')) return 'novena-principal';
  if (n.includes('grimorio') || n.includes('grimório')) return 'grimorio-dos-arcanjos';
  if (n.includes('arcanjo') || n.includes('arcanjos')) return 'poder-dos-arcanjos';
  if (n.includes('30') || n.includes('francisco')) return '30-oracoes-sao-francisco';
  if (n.includes('musica') || n.includes('música') || n.includes('anjos')) return 'musicas-dos-anjos-premium';
  return null;
}

const PRODUTO_NOME = {
  'novena-principal': 'Novena de Nossa Senhora Desatadora de Nós',
  'poder-dos-arcanjos': 'Poder dos 4 Arcanjos',
  '30-oracoes-sao-francisco': '30 Orações de São Francisco',
  'musicas-dos-anjos-premium': 'Músicas dos Anjos Premium',
  'grimorio-dos-arcanjos': 'Grimório dos Arcanjos',
};

async function enviarEmailAcesso(email, nomeCliente, produtoId) {
  if (!process.env.BREVO_API_KEY) return;
  const nomeProduto = PRODUTO_NOME[produtoId] || 'seu produto';
  const nomeExibido = nomeCliente ? nomeCliente.split(' ')[0] : 'amigo(a)';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a2e;color:#ffffff;padding:40px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:30px;">
        <h1 style="color:#d4af37;font-size:28px;margin:0;">✨ Seu acesso está liberado!</h1>
      </div>
      <p style="font-size:16px;line-height:1.6;">Olá, <strong>${nomeExibido}</strong>!</p>
      <p style="font-size:16px;line-height:1.6;">Seu acesso ao <strong style="color:#d4af37;">${nomeProduto}</strong> foi liberado com sucesso.</p>
      <p style="font-size:16px;line-height:1.6;">Para acessar, clique no botão abaixo e entre com o seu e-mail de compra:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="https://palpiitecerto.site/login/" style="background:#d4af37;color:#0a0a2e;padding:15px 35px;border-radius:8px;text-decoration:none;font-size:18px;font-weight:bold;">
          Acessar agora →
        </a>
      </div>
      <div style="background:#1a1a4e;border-radius:8px;padding:20px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#aaa;">Seu e-mail de acesso:</p>
        <p style="margin:5px 0 0;font-size:16px;color:#d4af37;font-weight:bold;">${email}</p>
      </div>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">Se tiver qualquer dúvida, responda este e-mail que te ajudamos.</p>
      <p style="font-size:14px;color:#aaa;">Que Nossa Senhora Desatadora de Nós abençoe você! 🙏</p>
    </div>
  `;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Novena de Nossa Senhora', email: 'suportepadrelucaslima@gmail.com' },
        to: [{ email, name: nomeCliente || email }],
        subject: `✨ Seu acesso ao ${nomeProduto} está liberado!`,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Brevo erro ${res.status}: ${body}`);
    } else {
      console.log(`Email enviado para ${email}`);
    }
  } catch (err) {
    console.error('Erro ao enviar email Brevo:', err.message);
  }
}

const TODOS_PRODUTOS = [
  'poder-dos-arcanjos',
  '30-oracoes-sao-francisco',
  'musicas-dos-anjos-premium',
  'grimorio-dos-arcanjos',
];

async function registrarAcesso(email, produtoId) {
  if (produtoId === 'all') {
    for (const p of TODOS_PRODUTOS) {
      await supabase
        .from('compradores')
        .upsert({ email, produto_id: p, ativo: true }, { onConflict: 'email,produto_id' });
    }
    return;
  }
  await supabase
    .from('compradores')
    .upsert({ email, produto_id: produtoId, ativo: true }, { onConflict: 'email,produto_id' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};

  // Log completo para identificar estrutura do payload Kiwify
  console.log('PAYLOAD_KIWIFY:', JSON.stringify(body));

  // Kiwify: registra só quando pagamento foi aprovado
  const orderStatus = body?.order_status || '';
  const eventType = body?.webhook_event_type || '';
  const pago = orderStatus === 'paid' || eventType === 'order_approved';
  if (!pago) {
    return res.status(200).json({ ok: true, ignorado: true, orderStatus, eventType });
  }

  const email =
    body?.Customer?.email ||
    body?.customer?.email ||
    body?.email ||
    null;

  // Kiwify usa "Product" com P maiúsculo e "product_id"
  const kiwifyProductId = body?.Product?.product_id || body?.product?.id || null;
  const kiwifyProductName = body?.Product?.product_name || body?.product?.name || null;

  if (!email) {
    console.error('Webhook sem email. Payload:', JSON.stringify(body));
    return res.status(400).json({ erro: 'Email do comprador não encontrado' });
  }

  // Log para identificar IDs desconhecidos
  if (kiwifyProductId && !PRODUTO_MAP[kiwifyProductId]) {
    console.log(`Produto desconhecido — id: ${kiwifyProductId}, nome: ${kiwifyProductName}`);
  }

  const emailNorm = email.toLowerCase().trim();
  const nomeCliente = body?.Customer?.full_name || body?.customer?.name || '';

  let produtoId = kiwifyProductId ? PRODUTO_MAP[kiwifyProductId] : null;
  if (!produtoId && kiwifyProductName) produtoId = mapearPorNome(kiwifyProductName);
  if (!produtoId) produtoId = 'all';

  try {
    await registrarAcesso(emailNorm, produtoId);
    console.log(`Acesso liberado: ${emailNorm} → ${produtoId}`);
    await enviarEmailAcesso(emailNorm, nomeCliente, produtoId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao registrar acesso:', err.message);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
