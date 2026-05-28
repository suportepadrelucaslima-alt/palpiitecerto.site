const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  if (payload.role !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('compradores')
    .select('email, produto_id, ativo, created_at, ultimo_acesso')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase error:', error.message);
    return res.status(500).json({ erro: 'Erro interno' });
  }

  return res.json({ compradores: data });
};
