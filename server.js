const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render.com
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rooms State
// roomId -> { id, players: [ { id, name, isHost, ready, lines, board } ], currentTurn: 0, calledNumbers: [], state: 'waiting'|'playing'|'finished' }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  // Create a new multiplayer room
  socket.on('create-room', ({ playerName }) => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const room = {
      id: roomId,
      players: [
        {
          id: socket.id,
          name: (playerName || 'Player 1').trim().slice(0, 16),
          isHost: true,
          ready: false,
          lines: 0,
          board: null
        }
      ],
      currentTurn: 0,
      calledNumbers: [],
      state: 'waiting', // waiting, ready, playing, finished
      winner: null
    };

    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);

    socket.emit('room-created', {
      roomId,
      player: room.players[0],
      players: room.players
    });
  });

  // Join an existing room
  socket.on('join-room', ({ roomId, playerName }) => {
    const code = (roomId || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error-message', { message: 'Room not found! Check your code.' });
    }

    if (room.players.length >= 2) {
      return socket.emit('error-message', { message: 'Room is already full (max 2 players for 1v1 Bingo).' });
    }

    const newPlayer = {
      id: socket.id,
      name: (playerName || 'Player 2').trim().slice(0, 16),
      isHost: false,
      ready: false,
      lines: 0,
      board: null
    };

    room.players.push(newPlayer);
    currentRoomId = code;
    socket.join(code);

    // Notify room of updated player list
    io.to(code).emit('room-joined', {
      roomId: code,
      players: room.players,
      state: room.state
    });
  });

  // Player sets their board and marks Ready
  socket.on('player-ready', ({ board }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const player = room.players.find(p => p.id === socket.id);

    if (!player) return;

    player.board = board;
    player.ready = true;
    player.lines = 0;

    // Check if both players are ready
    const allReady = room.players.length === 2 && room.players.every(p => p.ready);

    if (allReady) {
      room.state = 'playing';
      room.calledNumbers = [];
      room.winner = null;
      room.currentTurn = Math.floor(Math.random() * 2); // Random first turn

      io.to(currentRoomId).emit('game-started', {
        currentTurnPlayerId: room.players[room.currentTurn].id,
        currentTurnPlayerName: room.players[room.currentTurn].name,
        players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, lines: 0 }))
      });
    } else {
      io.to(currentRoomId).emit('player-status-update', {
        players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, lines: p.lines }))
      });
    }
  });

  // Number picked by player whose turn it is
  socket.on('pick-number', ({ number }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);

    if (room.state !== 'playing') return;

    const currentActivePlayer = room.players[room.currentTurn];
    if (!currentActivePlayer || currentActivePlayer.id !== socket.id) {
      return socket.emit('error-message', { message: 'Not your turn!' });
    }

    const num = parseInt(number, 10);
    if (isNaN(num) || num < 1 || num > 25) return;
    if (room.calledNumbers.includes(num)) return;

    room.calledNumbers.push(num);

    // Rotate turn
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    const nextPlayer = room.players[room.currentTurn];

    io.to(currentRoomId).emit('number-called', {
      number: num,
      callerId: socket.id,
      callerName: currentActivePlayer.name,
      calledNumbers: room.calledNumbers,
      nextTurnPlayerId: nextPlayer.id,
      nextTurnPlayerName: nextPlayer.name
    });
  });

  // Update line count & claim Bingo
  socket.on('update-lines', ({ lines }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.lines = Math.min(5, Math.max(0, parseInt(lines, 10) || 0));

    io.to(currentRoomId).emit('lines-updated', {
      playerId: player.id,
      lines: player.lines
    });

    if (player.lines >= 5 && room.state === 'playing') {
      room.state = 'finished';
      room.winner = player;

      io.to(currentRoomId).emit('game-over', {
        winnerId: player.id,
        winnerName: player.name,
        reason: '5 Lines Completed (B-I-N-G-O)!'
      });
    }
  });

  // Chat message or emoji reaction
  socket.on('send-reaction', ({ emoji }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    const name = player ? player.name : 'Player';

    io.to(currentRoomId).emit('receive-reaction', {
      senderId: socket.id,
      senderName: name,
      emoji: (emoji || '🎉').slice(0, 8)
    });
  });

  socket.on('send-chat', ({ message }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    const name = player ? player.name : 'Player';

    const cleanMsg = (message || '').trim().slice(0, 100);
    if (!cleanMsg) return;

    io.to(currentRoomId).emit('receive-chat', {
      senderId: socket.id,
      senderName: name,
      message: cleanMsg,
      timestamp: Date.now()
    });
  });

  // Rematch request
  socket.on('request-rematch', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);

    // Reset room state for rematch setup
    room.state = 'setup';
    room.calledNumbers = [];
    room.winner = null;
    room.players.forEach(p => {
      p.ready = false;
      p.lines = 0;
      p.board = null;
    });

    io.to(currentRoomId).emit('rematch-started', {
      players: room.players.map(p => ({ id: p.id, name: p.name, ready: false, lines: 0 }))
    });
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      const departingIndex = room.players.findIndex(p => p.id === socket.id);

      if (departingIndex !== -1) {
        const departing = room.players[departingIndex];
        room.players.splice(departingIndex, 1);

        if (room.players.length === 0) {
          rooms.delete(currentRoomId);
        } else {
          // Promote remaining player to host
          room.players[0].isHost = true;
          room.state = 'waiting';
          io.to(currentRoomId).emit('player-left', {
            message: `${departing.name} left the game. Waiting for a new player...`,
            players: room.players
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Bingo Clash] Server running on port ${PORT}`);
  console.log(`Ready for Render.com deployment & local play.`);
});
