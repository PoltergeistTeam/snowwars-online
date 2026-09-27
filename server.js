const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const clients = new Map();

function send(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function broadcast(type, data, except = null) {
  for (const client of clients.values()) {
    if (client.ws !== except) send(client.ws, type, data);
  }
}

const server = http.createServer((req, res) => {
  // Главная страница сайта — index.html.
  // Игра открывается по адресу /snowwars_menu.html.
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  const url = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(__dirname, url);

  // Не разрешаем выход из папки проекта через ../
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    };

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const playerId = crypto.randomUUID();
  const player = {
    id: playerId,
    ws,
    nick: 'Игрок',
    avatar: '⛄',
    team: 'blue',
    pos: { x: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    snowCount: 3
  };

  clients.set(playerId, player);
  console.log(`✅ Игрок подключился (всего: ${clients.size})`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const data = msg.data || {};

      if (msg.type === 'player:join') {
        player.nick = data.nick || 'Игрок';
        player.avatar = data.avatar || '⛄';
        player.team = data.team === 'red' ? 'red' : 'blue';
        player.pos = player.team === 'red' ? { x: 0, z: 17 } : { x: 0, z: -17 };

        send(ws, 'player:joined', {
          playerId: player.id,
          roomId: 'public',
          players: Array.from(clients.values())
            .filter(p => p.id !== player.id)
            .map(p => ({
              id: p.id,
              nick: p.nick,
              avatar: p.avatar,
              team: p.team,
              pos: p.pos,
              yaw: p.yaw,
              pitch: p.pitch
            }))
        });

        broadcast('player:connected', {
          id: player.id,
          nick: player.nick,
          avatar: player.avatar,
          team: player.team,
          pos: player.pos,
          yaw: player.yaw,
          pitch: player.pitch
        }, ws);
        return;
      }

      if (msg.type === 'player:update') {
        if (data.pos) player.pos = data.pos;
        if (data.yaw !== undefined) player.yaw = data.yaw;
        if (data.pitch !== undefined) player.pitch = data.pitch;
        if (data.snowCount !== undefined) player.snowCount = data.snowCount;

        broadcast('player:updated', {
          id: player.id,
          pos: player.pos,
          yaw: player.yaw,
          pitch: player.pitch,
          snowCount: player.snowCount
        }, ws);
        return;
      }

      if (msg.type === 'snowball:throw') {
        broadcast('snowball:spawned', {
          id: crypto.randomUUID(),
          ownerId: player.id,
          pos: data.pos,
          velocity: data.velocity,
          team: player.team
        });
      }
    } catch (error) {
      console.error('WS parse error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(playerId);
    console.log(`❌ ${player.nick} отключился (осталось: ${clients.size})`);
    broadcast('player:disconnected', { id: playerId });
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 SnowWars сервер запущен на http://localhost:${PORT}`);
  console.log('🌐 Сайт: http://localhost:3000/');
  console.log('🎮 Игра: http://localhost:3000/snowwars_menu.html\n');
});
