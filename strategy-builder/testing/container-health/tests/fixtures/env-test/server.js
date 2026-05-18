/* eslint-disable */
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', greeting: process.env.GREETING || 'none' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(3000, () => console.log('Listening on 3000'));
