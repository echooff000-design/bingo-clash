/**
 * Bingo Clash - Main Game Controller
 * Supports Single-Player vs Computer AI & Real-time Online Multiplayer via Socket.io
 */

// Confetti Particle System
class ConfettiCannon {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.animId = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(count = 90) {
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#fbbf24'];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: this.canvas.width / 2,
        y: this.canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 18,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.008
      });
    }

    if (!this.animId) {
      this.render();
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravity
      p.rotation += p.rSpeed;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animId = requestAnimationFrame(() => this.render());
    } else {
      this.animId = null;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// Main Game Controller
class BingoGame {
  constructor() {
    this.mode = 'ai'; // 'ai' or 'online'
    this.board = []; // 25 numbers
    this.calledNumbers = new Set();
    this.lines = 0;
    this.isMyTurn = false;
    this.isSetupPhase = true;
    this.socket = null;
    this.roomId = null;
    this.myPlayerId = null;
    this.playerName = localStorage.getItem('bingo_player_name') || 'Player';
    this.ai = null;
    this.confetti = new ConfettiCannon(document.getElementById('confetti-canvas'));
    this.deferredPrompt = null;

    this.initDOM();
    this.initPWA();
    this.initThemes();
    this.checkUrlParams();
    this.setupBoard();
  }

  initDOM() {
    this.gridEl = document.getElementById('bingo-grid');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.lastCalledEl = document.getElementById('last-called-number');
    this.lastCallerNameEl = document.getElementById('last-caller-name');
    this.readyBtn = document.getElementById('btn-ready');
    this.randomizeBtn = document.getElementById('btn-randomize');
    this.bingoLetters = document.querySelectorAll('.bingo-letter');
    this.playerNameEl = document.getElementById('player-name-display');
    this.oppNameEl = document.getElementById('opp-name-display');
    this.oppLinesEl = document.getElementById('opp-lines-display');
    this.myLinesEl = document.getElementById('my-lines-display');

    // Modals
    this.modeModal = document.getElementById('modal-mode');
    this.onlineModal = document.getElementById('modal-online');
    this.gameoverModal = document.getElementById('modal-gameover');
    this.apkModal = document.getElementById('modal-apk');

    // Buttons
    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const muted = window.soundEngine.toggleMute();
      document.getElementById('btn-sound-toggle').textContent = muted ? '🔇' : '🔊';
    });

    document.getElementById('btn-mode-toggle').addEventListener('click', () => {
      this.openModeModal();
    });

    document.getElementById('btn-apk-header').addEventListener('click', () => {
      this.openApkModal();
    });

    this.randomizeBtn.addEventListener('click', () => {
      window.soundEngine.playPop();
      this.generateRandomBoard();
      this.renderBoard();
    });

    this.readyBtn.addEventListener('click', () => {
      this.onReadyClicked();
    });

    // Rematch
    document.getElementById('btn-rematch').addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      if (this.mode === 'ai') {
        this.startAIMode();
      } else if (this.socket && this.roomId) {
        this.socket.emit('request-rematch');
      }
    });

    // Mode selections
    document.getElementById('select-ai-mode').addEventListener('click', () => {
      this.modeModal.classList.add('hidden');
      this.startAIMode();
    });

    document.getElementById('select-online-mode').addEventListener('click', () => {
      this.modeModal.classList.add('hidden');
      this.onlineModal.classList.remove('hidden');
    });

    // Online Room Actions
    document.getElementById('btn-create-room').addEventListener('click', () => {
      this.createOnlineRoom();
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
      const code = document.getElementById('join-code-input').value.trim();
      if (code) {
        this.joinOnlineRoom(code);
      }
    });

    document.getElementById('btn-copy-link').addEventListener('click', () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('btn-copy-link');
        const oldText = btn.innerHTML;
        btn.innerHTML = '✅ Link Copied!';
        setTimeout(() => (btn.innerHTML = oldText), 2000);
      });
    });

    // Reactions
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.triggerReaction(emoji, true);
      });
    });

    // APK Modal close
    document.getElementById('btn-close-apk').addEventListener('click', () => {
      this.apkModal.classList.add('hidden');
    });
    document.getElementById('btn-close-mode').addEventListener('click', () => {
      this.modeModal.classList.add('hidden');
    });
    document.getElementById('btn-close-online').addEventListener('click', () => {
      this.onlineModal.classList.remove('hidden');
      this.onlineModal.classList.add('hidden');
    });
  }

  initThemes() {
    const themes = ['default', 'sunset', 'emerald'];
    let currentThemeIdx = 0;
    const themeBtn = document.getElementById('btn-theme-toggle');

    themeBtn.addEventListener('click', () => {
      currentThemeIdx = (currentThemeIdx + 1) % themes.length;
      const theme = themes[currentThemeIdx];
      if (theme === 'default') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
      window.soundEngine.playPop();
    });
  }

  initPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }

    // Capture install prompt for APK / App installation
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const apkBtn = document.getElementById('btn-apk-header');
      apkBtn.innerHTML = '📲 Install App';
      apkBtn.style.animation = 'pulseGlow 2s infinite';
    });
  }

  openApkModal() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User installed the Bingo APK / PWA app!');
        }
        this.deferredPrompt = null;
      });
    } else {
      this.apkModal.classList.remove('hidden');
    }
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      this.openModeModal();
      document.getElementById('join-code-input').value = roomParam;
      this.modeModal.classList.add('hidden');
      this.onlineModal.classList.remove('hidden');
    }
  }

  openModeModal() {
    this.modeModal.classList.remove('hidden');
  }

  setupBoard() {
    this.playerNameEl.textContent = this.playerName;
    this.generateRandomBoard();
    this.renderBoard();
    // Default to single player vs computer ready
    this.startAIMode();
  }

  generateRandomBoard() {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    this.board = nums;
  }

  renderBoard() {
    this.gridEl.innerHTML = '';
    const allLines = BingoAI.getLines();
    const winningCellIndices = new Set();

    // Check which cells are part of a completed line
    allLines.forEach(line => {
      const isComplete = line.every(idx => this.calledNumbers.has(this.board[idx]));
      if (isComplete) {
        line.forEach(idx => winningCellIndices.add(idx));
      }
    });

    this.board.forEach((num, index) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = num;
      cell.dataset.number = num;
      cell.dataset.index = index;

      if (this.calledNumbers.has(num)) {
        cell.classList.add('struck');
      }

      if (winningCellIndices.has(index)) {
        cell.classList.add('highlight-line');
      }

      // If it's playing phase and not my turn, or in setup phase, handle clicks
      cell.addEventListener('click', () => {
        this.onCellClicked(num);
      });

      this.gridEl.appendChild(cell);
    });

    this.updateLinesDisplay();
  }

  onCellClicked(num) {
    if (this.isSetupPhase) return;
    if (!this.isMyTurn) return;
    if (this.calledNumbers.has(num)) return;

    window.soundEngine.playStrike();

    if (this.mode === 'ai') {
      this.handleAICall(num, 'player');
    } else if (this.mode === 'online' && this.socket) {
      this.socket.emit('pick-number', { number: num });
    }
  }

  onReadyClicked() {
    if (!this.isSetupPhase) return;

    this.isSetupPhase = false;
    this.readyBtn.disabled = true;
    this.readyBtn.textContent = 'Ready! Locked';
    this.randomizeBtn.disabled = true;
    window.soundEngine.playPop();

    if (this.mode === 'ai') {
      this.isMyTurn = true;
      this.updateTurnUI('Your Turn! Pick a number', true);
    } else if (this.mode === 'online' && this.socket) {
      this.socket.emit('player-ready', { board: this.board });
      this.updateTurnUI('Waiting for friend to get ready...', false);
    }
  }

  // ================= SINGLE-PLAYER VS COMPUTER (OFFLINE) =================
  startAIMode() {
    this.mode = 'ai';
    this.ai = new BingoAI('smart');
    this.isSetupPhase = true;
    this.calledNumbers.clear();
    this.lines = 0;
    this.isMyTurn = false;

    this.oppNameEl.textContent = 'Computer 🤖';
    this.oppLinesEl.textContent = '0 Lines';
    this.myLinesEl.textContent = '0 Lines';

    this.readyBtn.disabled = false;
    this.readyBtn.textContent = 'Ready to Play!';
    this.randomizeBtn.disabled = false;

    this.updateTurnUI('Arrange or Randomize, then click Ready', false);
    this.resetBingoLetters();
    this.generateRandomBoard();
    this.renderBoard();
  }

  handleAICall(number, source) {
    this.calledNumbers.add(number);
    this.ai.markNumber(number);

    this.updateLastCalledUI(number, source === 'player' ? 'You' : 'Computer 🤖');
    this.renderBoard();

    // Check Player victory
    const myLines = this.calculateLines(this.board, this.calledNumbers);
    const aiLines = this.ai.lines;

    this.myLinesEl.textContent = `${myLines} Lines`;
    this.oppLinesEl.textContent = `${aiLines} Lines`;

    if (myLines >= 5) {
      this.triggerGameOver('Victory!', 'You got 5 lines (B-I-N-G-O) and defeated the Computer!', true);
      return;
    }
    if (aiLines >= 5) {
      this.triggerGameOver('Computer Won!', 'The Computer AI completed 5 lines first! Try again!', false);
      return;
    }

    if (source === 'player') {
      // Pass turn to Computer
      this.isMyTurn = false;
      this.updateTurnUI('Computer is thinking...', false);

      setTimeout(() => {
        const aiPick = this.ai.chooseNumber();
        if (aiPick) {
          window.soundEngine.playStrike();
          this.handleAICall(aiPick, 'ai');
          this.isMyTurn = true;
          this.updateTurnUI('Your Turn! Pick a number', true);
        }
      }, 750 + Math.random() * 400);
    }
  }

  // ================= ONLINE MULTIPLAYER (SOCKET.IO) =================
  initSocket() {
    if (this.socket) return;

    if (typeof io === 'undefined') {
      alert('Online multiplayer requires connection to the Node.js server. For offline play, click "Play vs Computer".');
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      this.myPlayerId = this.socket.id;
    });

    this.socket.on('room-created', ({ roomId, player }) => {
      this.roomId = roomId;
      this.mode = 'online';
      this.onlineModal.classList.add('hidden');
      document.getElementById('lobby-room-code').textContent = roomId;
      document.getElementById('lobby-card').classList.remove('hidden');

      this.updateTurnUI(`Room ${roomId} created. Share code or link with friend!`, false);
    });

    this.socket.on('room-joined', ({ roomId, players }) => {
      this.roomId = roomId;
      this.mode = 'online';
      this.onlineModal.classList.add('hidden');
      document.getElementById('lobby-card').classList.add('hidden');

      const opponent = players.find(p => p.id !== this.myPlayerId);
      if (opponent) {
        this.oppNameEl.textContent = opponent.name;
      }

      this.updateTurnUI('Friend joined! Click Ready when set.', false);
    });

    this.socket.on('game-started', ({ currentTurnPlayerId, currentTurnPlayerName, players }) => {
      this.isSetupPhase = false;
      this.calledNumbers.clear();
      this.lines = 0;
      this.resetBingoLetters();
      this.renderBoard();

      this.isMyTurn = (currentTurnPlayerId === this.myPlayerId);
      if (this.isMyTurn) {
        this.updateTurnUI('Your Turn! Pick a number', true);
        window.soundEngine.playPop();
      } else {
        this.updateTurnUI(`${currentTurnPlayerName}'s Turn...`, false);
      }
    });

    this.socket.on('number-called', ({ number, callerId, callerName, nextTurnPlayerId, nextTurnPlayerName }) => {
      this.calledNumbers.add(number);
      window.soundEngine.playStrike();

      this.updateLastCalledUI(number, callerId === this.myPlayerId ? 'You' : callerName);
      this.renderBoard();

      // Check lines
      const myLines = this.calculateLines(this.board, this.calledNumbers);
      if (myLines !== this.lines) {
        this.lines = myLines;
        this.socket.emit('update-lines', { lines: this.lines });
      }

      this.isMyTurn = (nextTurnPlayerId === this.myPlayerId);
      if (this.isMyTurn) {
        this.updateTurnUI('Your Turn! Pick a number', true);
      } else {
        this.updateTurnUI(`${nextTurnPlayerName}'s Turn...`, false);
      }
    });

    this.socket.on('lines-updated', ({ playerId, lines }) => {
      if (playerId !== this.myPlayerId) {
        this.oppLinesEl.textContent = `${lines} Lines`;
      }
    });

    this.socket.on('game-over', ({ winnerId, winnerName, reason }) => {
      const won = (winnerId === this.myPlayerId);
      this.triggerGameOver(
        won ? '🎉 BINGO! VICTORY!' : '💔 Game Over',
        won ? 'You got 5 lines and claimed BINGO!' : `${winnerName} got 5 lines and won the match!`,
        won
      );
    });

    this.socket.on('receive-reaction', ({ senderId, emoji }) => {
      this.triggerReaction(emoji, false);
    });

    this.socket.on('rematch-started', () => {
      this.isSetupPhase = true;
      this.calledNumbers.clear();
      this.lines = 0;
      this.resetBingoLetters();
      this.readyBtn.disabled = false;
      this.readyBtn.textContent = 'Ready to Play!';
      this.randomizeBtn.disabled = false;
      this.generateRandomBoard();
      this.renderBoard();
      this.updateTurnUI('Rematch! Arrange your board and click Ready.', false);
    });

    this.socket.on('player-left', ({ message }) => {
      alert(message);
      this.oppNameEl.textContent = 'Waiting...';
      this.oppLinesEl.textContent = '0 Lines';
      this.updateTurnUI('Waiting for another player to join...', false);
    });

    this.socket.on('error-message', ({ message }) => {
      alert(message);
    });
  }

  createOnlineRoom() {
    this.initSocket();
    const nameInput = document.getElementById('player-name-input').value.trim();
    if (nameInput) {
      this.playerName = nameInput;
      localStorage.setItem('bingo_player_name', this.playerName);
      this.playerNameEl.textContent = this.playerName;
    }
    this.socket.emit('create-room', { playerName: this.playerName });
  }

  joinOnlineRoom(code) {
    this.initSocket();
    const nameInput = document.getElementById('player-name-input').value.trim();
    if (nameInput) {
      this.playerName = nameInput;
      localStorage.setItem('bingo_player_name', this.playerName);
      this.playerNameEl.textContent = this.playerName;
    }
    this.socket.emit('join-room', { roomId: code, playerName: this.playerName });
  }

  // ================= UTILITIES & DISPLAY =================
  calculateLines(board, calledSet) {
    const allLines = BingoAI.getLines();
    let completedCount = 0;

    allLines.forEach(line => {
      const isFull = line.every(idx => calledSet.has(board[idx]));
      if (isFull) completedCount++;
    });

    const capped = Math.min(5, completedCount);
    if (capped > this.lines) {
      window.soundEngine.playLineComplete();
    }
    this.lines = capped;
    return this.lines;
  }

  updateLinesDisplay() {
    const letters = ['b', 'i', 'n', 'g', 'o'];
    letters.forEach((id, idx) => {
      const el = document.getElementById(`letter-${id}`);
      if (idx < this.lines) {
        if (!el.classList.contains('unlocked')) {
          el.classList.add('unlocked');
        }
      } else {
        el.classList.remove('unlocked');
      }
    });

    this.myLinesEl.textContent = `${this.lines} Lines`;
  }

  resetBingoLetters() {
    this.bingoLetters.forEach(el => el.classList.remove('unlocked'));
  }

  updateTurnUI(text, isMine) {
    this.turnIndicator.textContent = text;
    if (isMine) {
      this.turnIndicator.className = 'turn-indicator your-turn';
    } else {
      this.turnIndicator.className = 'turn-indicator opp-turn';
    }
  }

  updateLastCalledUI(number, callerName) {
    this.lastCalledEl.textContent = number;
    this.lastCallerNameEl.textContent = callerName;
  }

  triggerGameOver(title, message, isWinner) {
    this.isMyTurn = false;
    document.getElementById('victory-title').textContent = title;
    document.getElementById('victory-msg').textContent = message;
    document.getElementById('victory-trophy').textContent = isWinner ? '🏆' : '💀';

    if (isWinner) {
      window.soundEngine.playVictory();
      this.confetti.burst(120);
    } else {
      window.soundEngine.playDefeat();
    }

    setTimeout(() => {
      this.gameoverModal.classList.remove('hidden');
    }, 600);
  }

  triggerReaction(emoji, broadcast = true) {
    window.soundEngine.playPop();

    const floating = document.createElement('div');
    floating.className = 'floating-emoji';
    floating.textContent = emoji;
    floating.style.left = `${Math.random() * 60 + 20}%`;
    floating.style.bottom = '100px';

    document.body.appendChild(floating);
    setTimeout(() => floating.remove(), 2200);

    if (broadcast && this.mode === 'online' && this.socket && this.roomId) {
      this.socket.emit('send-reaction', { emoji });
    }
  }
}

// Boot game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.bingoGame = new BingoGame();
});
