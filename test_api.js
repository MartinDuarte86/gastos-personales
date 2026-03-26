const http = require('http');

const data = JSON.stringify({
  username: 'martintest', // guessing based on screenshot
  password: 'password' // If this doesn't work, I'll bypass authentication in the DB
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3010,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const json = JSON.parse(body);
    if (!json.token) return console.log('Login failed:', json);
    
    http.get({
      hostname: '127.0.0.1',
      port: 3010,
      path: '/api/presupuesto/liquidez-inversion',
      headers: { 'Authorization': 'Bearer ' + json.token }
    }, res2 => {
      let b2 = '';
      res2.on('data', d => b2 += d);
      res2.on('end', () => console.log('Liquidez response:', res2.statusCode, b2));
    });
  });
});

req.write(data);
req.end();
