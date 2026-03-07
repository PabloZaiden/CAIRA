/* eslint-disable */
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200);
    res.end('ok');
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(3000, () => console.log('Listening on 3000'));
