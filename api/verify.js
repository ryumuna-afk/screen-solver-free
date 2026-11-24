export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  const correctPassword = process.env.ACCESS_PASSWORD;

  if (!correctPassword) {
    return res.status(500).json({ error: '서버에 비밀번호가 설정되지 않았습니다.' });
  }

  if (password === correctPassword) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
}