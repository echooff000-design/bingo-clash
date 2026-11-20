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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rooms State
// roomId -> { id, gameType, players: [{ id, name, isHost, ready, lines, color, symbol }], currentTurn, state, gameData }
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

  // ================= ROOM CREATION & JOIN =================
  socket.on('create-room', ({ playerName, gameType = 'bingo' }) => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const room = {
      id: roomId,
      gameType,
      players: [
        {
          id: socket.id,
          name: (playerName || 'Player 1').trim().slice(0, 16),
          isHost: true,
          ready: false,
          lines: 0,
          color: 'red',
          symbol: 'X'
        }
      ],
      currentTurn: 0,
      state: 'waiting',
      gameData: {}
    };

    if (gameType === 'bingo') {
      room.gameData = { calledNumbers: [] };
    } else if (gameType === 'tictactoe') {
      room.gameData = { board: Array(9).fill(null) };
    } else if (gameType === 'ludo') {
      room.gameData = {
        diceValue: null,
        canRoll: true,
        tokens: {
          red: [-1, -1, -1, -1],
          green: [-1, -1, -1, -1]
        }
      };
    }

    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);

    socket.emit('room-created', {
      roomId,
      gameType,
      player: room.players[0],
      players: room.players
    });
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const code = (roomId || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error-message', { message: 'Room not found! Check your code.' });
    }

    if (room.players.length >= 2) {
      return socket.emit('error-message', { message: 'Room is full (max 2 players for 1v1 duel).' });
    }

    const newPlayer = {
      id: socket.id,
      name: (playerName || 'Player 2').trim().slice(0, 16),
      isHost: false,
      ready: false,
      lines: 0,
      color: 'green',
      symbol: 'O'
    };

    room.players.push(newPlayer);
    currentRoomId = code;
    socket.join(code);

    io.to(code).emit('room-joined', {
      roomId: code,
      gameType: room.gameType,
      players: room.players,
      state: room.state
    });

    // Auto-start Tic Tac Toe and Ludo when 2nd player joins!
    if (room.gameType === 'tictactoe') {
      room.state = 'playing';
      room.gameData.board = Array(9).fill(null);
      room.currentTurn = 0; // Host (X) starts

      io.to(code).emit('ttt-start', {
        turnPlayerId: room.players[0].id,
        turnPlayerName: room.players[0].name,
        symbolMap: {
          [room.players[0].id]: 'X',
          [room.players[1].id]: 'O'
        },
        playerNames: {
          X: room.players[0].name,
          O: room.players[1].name
        }
      });
    } else if (room.gameType === 'ludo') {
      room.state = 'playing';
      room.currentTurn = 0; // Host (Red) starts
      room.gameData = {
        diceValue: null,
        canRoll: true,
        tokens: {
          red: [-1, -1, -1, -1],
          green: [-1, -1, -1, -1]
        }
      };

      io.to(code).emit('ludo-start', {
        turnPlayerId: room.players[0].id,
        turnPlayerName: room.players[0].name,
        colorMap: {
          [room.players[0].id]: 'red',
          [room.players[1].id]: 'green'
        },
        playerNames: {
          red: room.players[0].name,
          green: room.players[1].name
        },
        tokens: room.gameData.tokens
      });
    }
  });

  // ================= BINGO =================
  socket.on('player-ready', ({ board }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'bingo') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = true;
    player.lines = 0;

    const allReady = room.players.length === 2 && room.players.every(p => p.ready);
    if (allReady) {
      room.state = 'playing';
      room.gameData.calledNumbers = [];
      room.currentTurn = Math.floor(Math.random() * 2);

      io.to(currentRoomId).emit('game-started', {
        currentTurnPlayerId: room.players[room.currentTurn].id,
        currentTurnPlayerName: room.players[room.currentTurn].name,
        players: room.players
      });
    } else {
      io.to(currentRoomId).emit('player-status-update', {
        players: room.players
      });
    }
  });

  socket.on('pick-number', ({ number }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'bingo' || room.state !== 'playing') return;

    const currentActive = room.players[room.currentTurn];
    if (!currentActive || currentActive.id !== socket.id) return;

    const num = parseInt(number, 10);
    if (isNaN(num) || num < 1 || num > 25) return;
    if (room.gameData.calledNumbers.includes(num)) return;

    room.gameData.calledNumbers.push(num);
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    const nextPlayer = room.players[room.currentTurn];

    io.to(currentRoomId).emit('number-called', {
      number: num,
      callerId: socket.id,
      callerName: currentActive.name,
      calledNumbers: room.gameData.calledNumbers,
      nextTurnPlayerId: nextPlayer.id,
      nextTurnPlayerName: nextPlayer.name
    });
  });

  socket.on('update-lines', ({ lines }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'bingo') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.lines = Math.min(5, Math.max(0, parseInt(lines, 10) || 0));

    // Notify opponent of updated line count
    io.to(currentRoomId).emit('lines-updated', {
      playerId: player.id,
      lines: player.lines
    });

    // Check WINNER: First to hit 5 lines wins!
    if (player.lines >= 5 && room.state === 'playing') {
      room.state = 'finished';
      io.to(currentRoomId).emit('game-over', {
        winnerId: player.id,
        winnerName: player.name,
        reason: '5 Lines Completed (B-I-N-G-O)!'
      });
    }
  });

  // ================= TIC TAC TOE =================
  socket.on('ttt-move', ({ index }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'tictactoe' || room.state !== 'playing') return;

    const currentActive = room.players[room.currentTurn];
    if (!currentActive || currentActive.id !== socket.id) return;

    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx > 8 || room.gameData.board[idx] !== null) return;

    const symbol = room.currentTurn === 0 ? 'X' : 'O';
    room.gameData.board[idx] = symbol;

    const winPatterns = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];

    let winningPattern = null;
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (room.gameData.board[a] && room.gameData.board[a] === room.gameData.board[b] && room.gameData.board[a] === room.gameData.board[c]) {
        winningPattern = pattern;
        break;
      }
    }

    const isDraw = !winningPattern && room.gameData.board.every(c => c !== null);

    if (winningPattern) {
      room.state = 'finished';
      io.to(currentRoomId).emit('ttt-over', {
        board: room.gameData.board,
        winningPattern,
        winnerId: socket.id,
        winnerName: currentActive.name,
        symbol,
        isDraw: false
      });
    } else if (isDraw) {
      room.state = 'finished';
      io.to(currentRoomId).emit('ttt-over', {
        board: room.gameData.board,
        winningPattern: null,
        winnerId: null,
        isDraw: true
      });
    } else {
      room.currentTurn = (room.currentTurn + 1) % 2;
      io.to(currentRoomId).emit('ttt-update', {
        board: room.gameData.board,
        nextTurnPlayerId: room.players[room.currentTurn].id,
        nextTurnPlayerName: room.players[room.currentTurn].name,
        lastIndex: idx,
        symbol
      });
    }
  });

  // ================= LUDO =================
  socket.on('ludo-roll-dice', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'ludo' || room.state !== 'playing') return;

    const currentActive = room.players[room.currentTurn];
    if (!currentActive || currentActive.id !== socket.id) return;
    if (!room.gameData.canRoll) return;

    const dice = Math.floor(Math.random() * 6) + 1;
    room.gameData.diceValue = dice;
    room.gameData.canRoll = false;

    const color = room.currentTurn === 0 ? 'red' : 'green';
    const tokens = room.gameData.tokens[color];

    const hasValidMove = tokens.some(pos => {
      if (pos === -1) return dice === 6;
      if (pos === 57) return false;
      return (pos + dice) <= 57;
    });

    io.to(currentRoomId).emit('ludo-dice-rolled', {
      dice,
      rollerId: socket.id,
      rollerName: currentActive.name,
      color,
      hasValidMove
    });

    if (!hasValidMove) {
      setTimeout(() => {
        if (!rooms.has(currentRoomId)) return;
        room.currentTurn = (room.currentTurn + 1) % 2;
        room.gameData.canRoll = true;
        room.gameData.diceValue = null;
        io.to(currentRoomId).emit('ludo-turn-change', {
          nextTurnPlayerId: room.players[room.currentTurn].id,
          nextTurnPlayerName: room.players[room.currentTurn].name,
          color: room.currentTurn === 0 ? 'red' : 'green'
        });
      }, 1200);
    }
  });

  socket.on('ludo-move-token', ({ tokenIndex }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    if (room.gameType !== 'ludo' || room.state !== 'playing') return;

    const currentActive = room.players[room.currentTurn];
    if (!currentActive || currentActive.id !== socket.id) return;
    if (room.gameData.canRoll || !room.gameData.diceValue) return;

    const dice = room.gameData.diceValue;
    const color = room.currentTurn === 0 ? 'red' : 'green';
    const oppColor = color === 'red' ? 'green' : 'red';
    const tokens = room.gameData.tokens[color];
    const oppTokens = room.gameData.tokens[oppColor];

    const tIdx = parseInt(tokenIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx > 3) return;

    let pos = tokens[tIdx];
    if (pos === 57) return;

    let moved = false;
    let captured = false;

    if (pos === -1) {
      if (dice === 6) {
        tokens[tIdx] = 0;
        moved = true;
      }
    } else if (pos + dice <= 57) {
      tokens[tIdx] = pos + dice;
      moved = true;

      const newPos = tokens[tIdx];
      if (newPos >= 0 && newPos <= 50) {
        const safeSpots = [0, 8, 13, 21, 26, 34, 39, 47];
        if (!safeSpots.includes(newPos)) {
          const oppEquivalent = (newPos + 26) % 52;
          oppTokens.forEach((oppP, oIdx) => {
            if (oppP === oppEquivalent) {
              oppTokens[oIdx] = -1;
              captured = true;
            }
          });
        }
      }
    }

    if (!moved) return;

    const hasWon = tokens.every(p => p === 57);

    io.to(currentRoomId).emit('ludo-token-moved', {
      color,
      tokenIndex: tIdx,
      tokens: room.gameData.tokens,
      captured,
      hasWon
    });

    if (hasWon) {
      room.state = 'finished';
      io.to(currentRoomId).emit('ludo-over', {
        winnerId: socket.id,
        winnerName: currentActive.name,
        color
      });
      return;
    }

    const bonusTurn = (dice === 6 || captured);
    if (!bonusTurn) {
      room.currentTurn = (room.currentTurn + 1) % 2;
    }

    room.gameData.canRoll = true;
    room.gameData.diceValue = null;

    io.to(currentRoomId).emit('ludo-turn-change', {
      nextTurnPlayerId: room.players[room.currentTurn].id,
      nextTurnPlayerName: room.players[room.currentTurn].name,
      color: room.currentTurn === 0 ? 'red' : 'green',
      bonusTurn
    });
  });

  // ================= COMMON REMATCH & REACTIONS =================
  socket.on('request-rematch', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);

    if (room.gameType === 'bingo') {
      room.state = 'waiting';
      room.players.forEach(p => { p.ready = false; p.lines = 0; });
      room.gameData = { calledNumbers: [] };
      io.to(currentRoomId).emit('rematch-started', { gameType: 'bingo', players: room.players });
    } else if (room.gameType === 'tictactoe') {
      room.state = 'playing';
      room.currentTurn = 0;
      room.gameData = { board: Array(9).fill(null) };
      io.to(currentRoomId).emit('ttt-start', {
        turnPlayerId: room.players[0].id,
        turnPlayerName: room.players[0].name,
        symbolMap: { [room.players[0].id]: 'X', [room.players[1].id]: 'O' },
        playerNames: { X: room.players[0].name, O: room.players[1].name }
      });
    } else if (room.gameType === 'ludo') {
      room.state = 'playing';
      room.currentTurn = 0;
      room.gameData = {
        diceValue: null,
        canRoll: true,
        tokens: { red: [-1, -1, -1, -1], green: [-1, -1, -1, -1] }
      };
      io.to(currentRoomId).emit('ludo-start', {
        turnPlayerId: room.players[0].id,
        turnPlayerName: room.players[0].name,
        colorMap: { [room.players[0].id]: 'red', [room.players[1].id]: 'green' },
        playerNames: { red: room.players[0].name, green: room.players[1].name },
        tokens: room.gameData.tokens
      });
    }
  });

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
          room.players[0].isHost = true;
          room.state = 'waiting';
          io.to(currentRoomId).emit('player-left', {
            message: `${departing.name} left the game. Waiting for a player...`,
            players: room.players
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Arcade Hub] Server running on port ${PORT}`);
});
