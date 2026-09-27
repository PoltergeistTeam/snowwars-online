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
    if (client.ws !== except) {
      send(client.ws, type, data);
    }
  }
}

const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/snowwars_menu.html' : req.url;
  const filePath = path.join(__dirname, url);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    if (ext === '.js') contentType = 'application/javascript';
    if (ext === '.css') contentType = 'text/css';

    res.writeHead(200, { 'Content-Type': contentType });
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
  console.log(`✅ Игрок подключился: ${player.nick} (всего: ${clients.size})`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const data = msg.data || {};

      if (msg.type === 'player:join') {
        player.nick = data.nick || 'Игрок';
        player.avatar = data.avatar || '⛄';
        player.team = data.team === 'red' ? 'red' : 'blue';

        player.pos = player.team === 'red'
          ? { x: 0, z: 17 }
          : { x: 0, z: -17 };

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
              pos: p.pos
            }))
        });

        broadcast('player:connected', {
          id: player.id,
          nick: player.nick,
          avatar: player.avatar,
          team: player.team,
          pos: player.pos
        }, ws);

        console.log(`🎮 ${player.nick} присоединился (${player.team})`);
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
    } catch (e) {
      console.error('WS parse error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(playerId);
    console.log(`❌ ${player.nick} отключился (осталось: ${clients.size})`);
    broadcast('player:disconnected', { id: playerId });
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 SnowWars сервер запущен на http://localhost:${PORT}\n`);
});
