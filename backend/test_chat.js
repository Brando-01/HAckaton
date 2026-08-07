const http = require('http');

function post(message, sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message, sessionId });
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log('1) hola');
    console.log(await post('hola', 'test1'));
    console.log('\n2) no ya entendí');
    console.log(await post('no ya entendí', 'test1'));
    console.log('\n3) hola (debería iniciar sin nombre)');
    console.log(await post('hola', 'test1'));
  } catch (e) {
    console.error(e);
  }
})();
