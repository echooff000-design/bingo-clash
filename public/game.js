/**
 * Arcade Clash - Master Controller
 * Unifies Bingo Clash, Tic Tac Toe Arena, and Ludo Duel
 * Both Offline vs Computer AI & Real-time Online Multiplayer
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
      p.vy += 0.45;
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

// Main Arcade Hub Controller
class ArcadeHub {
  constructor() {
    this.activeGame = 'bingo'; // 'bingo', 'tictactoe', 'ludo'
    this.mode = 'ai'; // 'ai' or 'online'
    this.socket = null;
    this.roomId = null;
    this.myPlayerId = null;
    this.playerName = localStorage.getItem('arcade_player_name') || 'Player';
    this.confetti = new ConfettiCannon(document.getElementById('confetti-canvas'));
    this.deferredPrompt = null;

    // Sub-games
    this.bingoBoard = [];
    this.bingoCalled = new Set();
    this.bingoLines = 0;
    this.bingoIsMyTurn = false;
    this.bingoIsSetup = true;
    this.bingoAI = null;

    this.tttGame = null;
    this.ludoGame = null;

    this.initDOM();
    this.initPWA();
    this.initThemes();
    this.initSubGames();
    this.checkUrlParams();
  }

  initDOM() {
    // Top Tabs
    this.tabBtns = document.querySelectorAll('.game-tab-btn');
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const game = btn.dataset.game;
        this.switchGame(game);
      });
    });

    // Bingo DOM Elements
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

    // Header buttons
    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const muted = window.soundEngine.toggleMute();
      document.getElementById('btn-sound-toggle').textContent = muted ? '🔇' : '🔊';
    });

    document.getElementById('btn-mode-toggle').addEventListener('click', () => {
      this.modeModal.classList.remove('hidden');
    });

    document.getElementById('btn-apk-header').addEventListener('click', () => {
      this.openApkModal();
    });

    // Bingo Buttons
    this.randomizeBtn.addEventListener('click', () => {
      window.soundEngine.playPop();
      this.generateRandomBingoBoard();
      this.renderBingoBoard();
    });

    this.readyBtn.addEventListener('click', () => {
      this.onBingoReadyClicked();
    });

    // Rematch
    document.getElementById('btn-rematch').addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      if (this.mode === 'ai') {
        if (this.activeGame === 'bingo') this.startBingoAIMode();
        else if (this.activeGame === 'tictactoe') this.tttGame.startAIMode();
        else if (this.activeGame === 'ludo') this.ludoGame.startAIMode();
      } else if (this.socket && this.roomId) {
        this.socket.emit('request-rematch');
      }
    });

    // Mode selections
    document.getElementById('select-ai-mode').addEventListener('click', () => {
      this.modeModal.classList.add('hidden');
      this.mode = 'ai';
      if (this.activeGame === 'bingo') this.startBingoAIMode();
      else if (this.activeGame === 'tictactoe') this.tttGame.startAIMode();
      else if (this.activeGame === 'ludo') this.ludoGame.startAIMode();
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
      const url = `${window.location.origin}${window.location.pathname}?game=${this.activeGame}&room=${this.roomId}`;
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

    // Modal Close
    document.getElementById('btn-close-apk').addEventListener('click', () => {
      this.apkModal.classList.add('hidden');
    });
    document.getElementById('btn-close-mode').addEventListener('click', () => {
      this.modeModal.classList.add('hidden');
    });
    document.getElementById('btn-close-online').addEventListener('click', () => {
      this.onlineModal.classList.add('hidden');
    });
  }

  initSubGames() {
    this.tttGame = new TicTacToeGame(this);
    this.ludoGame = new LudoGame(this);

    // Initial Bingo setup
    this.playerNameEl.textContent = this.playerName;
    this.generateRandomBingoBoard();
    this.renderBingoBoard();
    this.startBingoAIMode();
  }

  switchGame(gameName) {
    if (this.activeGame === gameName) return;
    this.activeGame = gameName;
    window.soundEngine.playPop();

    // Update Tab UI
    this.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.game === gameName);
    });

    // Update Views
    document.querySelectorAll('.game-view').forEach(view => {
      view.classList.remove('active-view');
    });
    const targetView = document.getElementById(`view-${gameName}`);
    if (targetView) targetView.classList.add('active-view');

    // Title & Logo
    const titles = {
      bingo: { title: 'BINGO CLASH', icon: '🎱' },
      tictactoe: { title: 'TIC TAC TOE', icon: '❌' },
      ludo: { title: 'LUDO DUEL', icon: '🎲' }
    };
    if (titles[gameName]) {
      document.getElementById('header-app-title').textContent = titles[gameName].title;
      document.getElementById('header-logo-icon').textContent = titles[gameName].icon;
    }

    // Reset game state for active game
    if (this.mode === 'ai') {
      if (gameName === 'bingo') this.startBingoAIMode();
      else if (gameName === 'tictactoe') this.tttGame.startAIMode();
      else if (gameName === 'ludo') this.ludoGame.startAIMode();
    }
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }

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
        this.deferredPrompt = null;
      });
    } else {
      this.apkModal.classList.remove('hidden');
    }
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    const roomParam = urlParams.get('room');

    if (gameParam && ['bingo', 'tictactoe', 'ludo'].includes(gameParam)) {
      this.switchGame(gameParam);
    }

    if (roomParam) {
      document.getElementById('join-code-input').value = roomParam;
      this.onlineModal.classList.remove('hidden');
    }
  }

  // ================= 1. BINGO ENGINE =================
  startBingoAIMode() {
    this.bingoAI = new BingoAI('smart');
    this.bingoIsSetup = true;
    this.bingoCalled.clear();
    this.bingoLines = 0;
    this.bingoIsMyTurn = false;

    this.oppNameEl.textContent = 'Computer 🤖';
    this.oppLinesEl.textContent = '0 Lines';
    this.myLinesEl.textContent = '0 Lines';

    this.readyBtn.disabled = false;
    this.readyBtn.textContent = 'Ready to Play!';
    this.randomizeBtn.disabled = false;

    this.updateBingoTurnUI('Arrange or Randomize, then click Ready', false);
    this.resetBingoLetters();
    this.generateRandomBingoBoard();
    this.renderBingoBoard();
  }

  generateRandomBingoBoard() {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    this.bingoBoard = nums;
  }

  renderBingoBoard() {
    this.gridEl.innerHTML = '';
    const allLines = BingoAI.getLines();
    const winningCellIndices = new Set();

    allLines.forEach(line => {
      const isComplete = line.every(idx => this.bingoCalled.has(this.bingoBoard[idx]));
      if (isComplete) {
        line.forEach(idx => winningCellIndices.add(idx));
      }
    });

    this.bingoBoard.forEach((num, index) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = num;
      cell.dataset.number = num;

      if (this.bingoCalled.has(num)) {
        cell.classList.add('struck');
      }

      if (winningCellIndices.has(index)) {
        cell.classList.add('highlight-line');
      }

      cell.addEventListener('click', () => {
        this.onBingoCellClicked(num);
      });

      this.gridEl.appendChild(cell);
    });

    this.updateBingoLinesDisplay();
  }

  onBingoCellClicked(num) {
    if (this.bingoIsSetup || !this.bingoIsMyTurn || this.bingoCalled.has(num)) return;

    window.soundEngine.playStrike();

    if (this.mode === 'ai') {
      this.handleBingoAICall(num, 'player');
    } else if (this.mode === 'online' && this.socket) {
      this.socket.emit('pick-number', { number: num });
    }
  }

  onBingoReadyClicked() {
    if (!this.bingoIsSetup) return;

    this.bingoIsSetup = false;
    this.readyBtn.disabled = true;
    this.readyBtn.textContent = 'Ready! Locked';
    this.randomizeBtn.disabled = true;
    window.soundEngine.playPop();

    if (this.mode === 'ai') {
      this.bingoIsMyTurn = true;
      this.updateBingoTurnUI('Your Turn! Pick a number', true);
    } else if (this.mode === 'online' && this.socket) {
      this.socket.emit('player-ready', { board: this.bingoBoard });
      this.updateBingoTurnUI('Waiting for friend to get ready...', false);
    }
  }

  handleBingoAICall(number, source) {
    this.bingoCalled.add(number);
    this.bingoAI.markNumber(number);

    this.updateBingoLastCalledUI(number, source === 'player' ? 'You' : 'Computer 🤖');
    this.renderBingoBoard();

    const myLines = this.calculateBingoLines(this.bingoBoard, this.bingoCalled);
    const aiLines = this.bingoAI.lines;

    this.myLinesEl.textContent = `${myLines} Lines`;
    this.oppLinesEl.textContent = `${aiLines} Lines`;

    if (myLines >= 5) {
      this.triggerGameOver('Victory!', 'You got 5 lines (B-I-N-G-O) and won!', true);
      return;
    }
    if (aiLines >= 5) {
      this.triggerGameOver('Computer Won!', 'The Computer AI completed 5 lines first!', false);
      return;
    }

    if (source === 'player') {
      this.bingoIsMyTurn = false;
      this.updateBingoTurnUI('Computer is thinking...', false);

      setTimeout(() => {
        const aiPick = this.bingoAI.chooseNumber();
        if (aiPick) {
          window.soundEngine.playStrike();
          this.handleBingoAICall(aiPick, 'ai');
          this.bingoIsMyTurn = true;
          this.updateBingoTurnUI('Your Turn! Pick a number', true);
        }
      }, 750 + Math.random() * 400);
    }
  }

  calculateBingoLines(board, calledSet) {
    const allLines = BingoAI.getLines();
    let completedCount = 0;

    allLines.forEach(line => {
      const isFull = line.every(idx => calledSet.has(board[idx]));
      if (isFull) completedCount++;
    });

    const capped = Math.min(5, completedCount);
    if (capped > this.bingoLines) {
      window.soundEngine.playLineComplete();
    }
    this.bingoLines = capped;
    return this.bingoLines;
  }

  updateBingoLinesDisplay() {
    const letters = ['b', 'i', 'n', 'g', 'o'];
    letters.forEach((id, idx) => {
      const el = document.getElementById(`letter-${id}`);
      if (el) {
        if (idx < this.bingoLines) el.classList.add('unlocked');
        else el.classList.remove('unlocked');
      }
    });
    this.myLinesEl.textContent = `${this.bingoLines} Lines`;
  }

  resetBingoLetters() {
    this.bingoLetters.forEach(el => el.classList.remove('unlocked'));
  }

  updateBingoTurnUI(text, isMine) {
    this.turnIndicator.textContent = text;
    this.turnIndicator.className = isMine ? 'turn-indicator your-turn' : 'turn-indicator opp-turn';
  }

  updateBingoLastCalledUI(number, callerName) {
    this.lastCalledEl.textContent = number;
    this.lastCallerNameEl.textContent = callerName;
  }

  // ================= SOCKET.IO MULTIPLAYER =================
  initSocket() {
    if (this.socket) return;

    if (typeof io === 'undefined') {
      alert('Online multiplayer requires connection to the Node.js server.');
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      this.myPlayerId = this.socket.id;
    });

    this.socket.on('room-created', ({ roomId, gameType, player }) => {
      this.roomId = roomId;
      this.mode = 'online';
      this.onlineModal.classList.add('hidden');
      document.getElementById('lobby-room-code').textContent = roomId;
      document.getElementById('lobby-card').classList.remove('hidden');

      if (gameType !== this.activeGame) {
        this.switchGame(gameType);
      }
    });

    this.socket.on('room-joined', ({ roomId, gameType, players }) => {
      this.roomId = roomId;
      this.mode = 'online';
      this.onlineModal.classList.add('hidden');
      document.getElementById('lobby-card').classList.add('hidden');

      if (gameType !== this.activeGame) {
        this.switchGame(gameType);
      }

      const opp = players.find(p => p.id !== this.myPlayerId);
      if (opp) {
        this.oppNameEl.textContent = opp.name;
      }
    });

    // Bingo Multiplayer Listeners
    this.socket.on('game-started', ({ currentTurnPlayerId, currentTurnPlayerName }) => {
      this.bingoIsSetup = false;
      this.bingoCalled.clear();
      this.bingoLines = 0;
      this.resetBingoLetters();
      this.renderBingoBoard();

      this.bingoIsMyTurn = (currentTurnPlayerId === this.myPlayerId);
      this.updateBingoTurnUI(this.bingoIsMyTurn ? 'Your Turn! Pick a number' : `${currentTurnPlayerName}'s Turn...`, this.bingoIsMyTurn);
    });

    this.socket.on('number-called', ({ number, callerId, callerName, nextTurnPlayerId, nextTurnPlayerName }) => {
      this.bingoCalled.add(number);
      window.soundEngine.playStrike();

      this.updateBingoLastCalledUI(number, callerId === this.myPlayerId ? 'You' : callerName);
      this.renderBingoBoard();

      const myLines = this.calculateBingoLines(this.bingoBoard, this.bingoCalled);
      if (myLines !== this.bingoLines) {
        this.bingoLines = myLines;
        this.socket.emit('update-lines', { lines: this.bingoLines });
      }

      this.bingoIsMyTurn = (nextTurnPlayerId === this.myPlayerId);
      this.updateBingoTurnUI(this.bingoIsMyTurn ? 'Your Turn! Pick a number' : `${nextTurnPlayerName}'s Turn...`, this.bingoIsMyTurn);
    });

    this.socket.on('lines-updated', ({ playerId, lines }) => {
      if (playerId !== this.myPlayerId) {
        this.oppLinesEl.textContent = `${lines} Lines`;
      }
    });

    this.socket.on('game-over', ({ winnerId, winnerName }) => {
      const won = (winnerId === this.myPlayerId);
      this.triggerGameOver(
        won ? '🎉 BINGO! VICTORY!' : '💔 Game Over',
        won ? 'You completed 5 lines!' : `${winnerName} got 5 lines!`,
        won
      );
    });

    // Tic Tac Toe Multiplayer Listeners
    this.socket.on('ttt-start', ({ turnPlayerId, symbolMap }) => {
      this.tttGame.mode = 'online';
      this.tttGame.mySymbol = symbolMap[this.myPlayerId] || 'X';
      this.tttGame.resetGame();
      this.tttGame.isMyTurn = (turnPlayerId === this.myPlayerId);
      this.tttGame.updateStatus(this.tttGame.isMyTurn ? `Your Turn (${this.tttGame.mySymbol})!` : 'Opponent is making move...', this.tttGame.isMyTurn);
    });

    this.socket.on('ttt-update', ({ board, nextTurnPlayerId, lastIndex, symbol }) => {
      this.tttGame.board = board;
      this.tttGame.cells[lastIndex].textContent = symbol;
      this.tttGame.cells[lastIndex].classList.add(symbol.toLowerCase());

      this.tttGame.isMyTurn = (nextTurnPlayerId === this.myPlayerId);
      this.tttGame.updateStatus(this.tttGame.isMyTurn ? `Your Turn (${this.tttGame.mySymbol})!` : 'Opponent is making move...', this.tttGame.isMyTurn);
    });

    this.socket.on('ttt-over', ({ board, winningPattern, winnerId, isDraw }) => {
      this.tttGame.board = board;
      this.tttGame.handleEnd({ isDraw, pattern: winningPattern, winner: winnerId === this.myPlayerId ? this.tttGame.mySymbol : (this.tttGame.mySymbol === 'X' ? 'O' : 'X') });
    });

    // Ludo Multiplayer Listeners
    this.socket.on('ludo-start', ({ turnPlayerId, colorMap, tokens }) => {
      this.ludoGame.mode = 'online';
      this.ludoGame.myColor = colorMap[this.myPlayerId] || 'red';
      this.ludoGame.tokens = tokens;
      this.ludoGame.currentTurnColor = 'red';
      this.ludoGame.canRoll = (turnPlayerId === this.myPlayerId);
      this.ludoGame.renderBoard();
      this.ludoGame.updateStatus(this.ludoGame.canRoll ? 'Your Turn! Roll the Dice 🎲' : 'Opponent is rolling...', this.ludoGame.canRoll);
    });

    this.socket.on('ludo-dice-rolled', ({ dice, rollerId, color, hasValidMove }) => {
      this.ludoGame.diceValue = dice;
      this.ludoGame.updateDiceUI(dice);

      if (rollerId === this.myPlayerId) {
        if (hasValidMove) {
          const myTokens = this.ludoGame.tokens[color];
          const movable = [];
          myTokens.forEach((p, i) => {
            if (p === -1 && dice === 6) movable.push(i);
            else if (p >= 0 && (p + dice) <= 57) movable.push(i);
          });

          if (movable.length === 1) {
            this.socket.emit('ludo-move-token', { tokenIndex: movable[0] });
          } else {
            this.ludoGame.highlightMovableTokens(movable);
          }
        }
      }
    });

    this.socket.on('ludo-token-moved', ({ tokens, captured }) => {
      this.ludoGame.tokens = tokens;
      this.ludoGame.renderBoard();
      if (captured) window.soundEngine.playVictory();
    });

    this.socket.on('ludo-turn-change', ({ nextTurnPlayerId, color, bonusTurn }) => {
      this.ludoGame.currentTurnColor = color;
      this.ludoGame.canRoll = (nextTurnPlayerId === this.myPlayerId);
      this.ludoGame.updateStatus(this.ludoGame.canRoll ? 'Your Turn! Roll the Dice 🎲' : 'Opponent is rolling...', this.ludoGame.canRoll);
    });

    this.socket.on('ludo-over', ({ winnerId }) => {
      const won = (winnerId === this.myPlayerId);
      this.triggerGameOver(won ? '🏆 LUDO VICTORY!' : '💔 Game Over', won ? 'You got all tokens Home!' : 'Opponent got all tokens Home!', won);
    });

    this.socket.on('receive-reaction', ({ emoji }) => {
      this.triggerReaction(emoji, false);
    });

    this.socket.on('player-left', ({ message }) => {
      alert(message);
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
      localStorage.setItem('arcade_player_name', this.playerName);
      this.playerNameEl.textContent = this.playerName;
    }
    this.socket.emit('create-room', { playerName: this.playerName, gameType: this.activeGame });
  }

  joinOnlineRoom(code) {
    this.initSocket();
    const nameInput = document.getElementById('player-name-input').value.trim();
    if (nameInput) {
      this.playerName = nameInput;
      localStorage.setItem('arcade_player_name', this.playerName);
      this.playerNameEl.textContent = this.playerName;
    }
    this.socket.emit('join-room', { roomId: code, playerName: this.playerName });
  }

  triggerGameOver(title, message, isWinner) {
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

// Boot Arcade Hub
window.addEventListener('DOMContentLoaded', () => {
  window.arcadeHub = new ArcadeHub();
});
