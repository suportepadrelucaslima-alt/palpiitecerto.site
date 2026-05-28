const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ erro: 'Email obrigatório' });

  const emailNorm = email.toLowerCase().trim();

  if (emailNorm === (process.env.ADMIN_EMAIL || '').toLowerCase()) {
    const token = jwt.sign(
      { email: emailNorm, produtos: 'all', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );
    return res.json({ token, redirect: '/inicio-oracoes-principal/' });
  }

  const { data, error } = await supabase
    .from('compradores')
    .select('produto_id')
    .eq('email', emailNorm)
    .eq('ativo', true);

  if (error) {
    console.error('Supabase error:', error.message);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({
      erro: 'Email não encontrado. Verifique se usou o mesmo e-mail da compra.'
    });
  }

  const produtos = data.map(r => r.produto_id);

  try {
    await supabase
      .from('compradores')
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq('email', emailNorm);
  } catch (_) {}

  const token = jwt.sign(
    { email: emailNorm, produtos },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return res.json({ token, redirect: '/inicio-oracoes-principal/' });
};
