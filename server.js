const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_KEY = process.env.TOSS_CLIENT_KEY;
const SECRET_KEY = process.env.TOSS_SECRET_KEY;

if (!CLIENT_KEY || !SECRET_KEY) {
  console.error('TOSS_CLIENT_KEY 와 TOSS_SECRET_KEY 환경변수를 설정하세요.');
  process.exit(1);
}

const INDEX_FILE = path.join(__dirname, 'index.html');
const ORDER_ID_RE = /^[A-Za-z0-9_=-]{6,64}$/;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function confirmPayment(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { message: '잘못된 요청입니다.' });
  }

  const { paymentKey, orderId, amount } = body;
  const valid =
    typeof paymentKey === 'string' && paymentKey.length > 0 &&
    typeof orderId === 'string' && ORDER_ID_RE.test(orderId) &&
    Number.isInteger(amount) && amount > 0;
  if (!valid) return send(res, 400, { message: '결제 정보가 올바르지 않습니다.' });

  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(SECRET_KEY + ':').toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  send(res, tossRes.status, await tossRes.json());
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && ['/', '/success', '/fail'].includes(pathname)) {
      return send(res, 200, fs.readFileSync(INDEX_FILE), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/api/config') {
      return send(res, 200, { clientKey: CLIENT_KEY });
    }
    if (req.method === 'POST' && pathname === '/api/payments/confirm') {
      return await confirmPayment(req, res);
    }
    send(res, 404, { message: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { message: '서버 오류가 발생했습니다.' });
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
