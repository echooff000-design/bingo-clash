/**
 * Tic Tac Toe Arena - Single-Player AI & Online Multiplayer
 */
class TicTacToeGame {
  constructor(hub) {
    this.hub = hub;
    this.board = Array(9).fill(null);
    this.mySymbol = 'X';
    this.currentTurnSymbol = 'X';
    this.mode = 'ai'; // 'ai' or 'online'
    this.isMyTurn = true;
    this.gameOver = false;
    this.scores = { X: 0, O: 0, ties: 0 };

    this.winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    this.initDOM();
  }

  initDOM() {
    this.cells = document.querySelectorAll('.ttt-cell');
    this.statusEl = document.getElementById('ttt-status');
    this.scoreXEl = document.getElementById('ttt-score-x');
    this.scoreOEl = document.getElementById('ttt-score-o');
    this.scoreTieEl = document.getElementById('ttt-score-tie');
    this.btnReset = document.getElementById('btn-ttt-restart');

    this.cells.forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.dataset.index, 10);
        this.handleCellClick(idx);
      });
    });

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        if (this.mode === 'ai') {
          this.resetGame();
        } else if (this.hub.socket && this.hub.roomId) {
          this.hub.socket.emit('request-rematch');
        }
      });
    }
  }

  startAIMode() {
    this.mode = 'ai';
    this.mySymbol = 'X';
    this.resetGame();
    this.updateStatus('Your Turn (X)! Click a cell.', true);
  }

  resetGame() {
    this.board = Array(9).fill(null);
    this.gameOver = false;
    this.currentTurnSymbol = 'X';
    this.isMyTurn = (this.mySymbol === 'X');

    this.cells.forEach(cell => {
      cell.textContent = '';
      cell.className = 'ttt-cell';
    });

    this.updateStatus(this.isMyTurn ? 'Your Turn (X)!' : 'Computer is thinking...', this.isMyTurn);
  }

  handleCellClick(idx) {
    if (this.gameOver || !this.isMyTurn || this.board[idx] !== null) return;

    window.soundEngine.playStrike();

    if (this.mode === 'ai') {
      this.makeMove(idx, this.mySymbol);

      const winInfo = this.checkWin(this.board);
      if (winInfo) {
        this.handleEnd(winInfo);
        return;
      }

      if (this.isBoardFull(this.board)) {
        this.handleEnd({ isDraw: true });
        return;
      }

      // Computer's turn
      this.isMyTurn = false;
      this.currentTurnSymbol = 'O';
      this.updateStatus('Computer is thinking...', false);

      setTimeout(() => {
        if (this.gameOver) return;
        const aiMove = this.getBestMove();
        if (aiMove !== -1) {
          window.soundEngine.playPop();
          this.makeMove(aiMove, 'O');

          const aiWin = this.checkWin(this.board);
          if (aiWin) {
            this.handleEnd(aiWin);
            return;
          }

          if (this.isBoardFull(this.board)) {
            this.handleEnd({ isDraw: true });
            return;
          }

          this.isMyTurn = true;
          this.currentTurnSymbol = 'X';
          this.updateStatus('Your Turn (X)!', true);
        }
      }, 450);

    } else if (this.mode === 'online' && this.hub.socket) {
      this.hub.socket.emit('ttt-move', { index: idx });
    }
  }

  makeMove(idx, symbol) {
    this.board[idx] = symbol;
    const cell = this.cells[idx];
    cell.textContent = symbol;
    cell.classList.add(symbol.toLowerCase());
  }

  // Minimax Algorithm for Smart AI
  getBestMove() {
    // 15% casual mistake rate so it's fun and beatable, 85% optimal
    if (Math.random() < 0.15) {
      const empty = this.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
      if (empty.length > 0) return empty[Math.floor(Math.random() * empty.length)];
    }

    let bestScore = -Infinity;
    let move = -1;

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === null) {
        this.board[i] = 'O';
        let score = this.minimax(this.board, 0, false);
        this.board[i] = null;
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }
    return move;
  }

  minimax(board, depth, isMaximizing) {
    const win = this.checkWin(board);
    if (win) {
      return win.winner === 'O' ? 10 - depth : depth - 10;
    }
    if (this.isBoardFull(board)) return 0;

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = 'O';
          let score = this.minimax(board, depth + 1, false);
          board[i] = null;
          maxScore = Math.max(maxScore, score);
        }
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = 'X';
          let score = this.minimax(board, depth + 1, true);
          board[i] = null;
          minScore = Math.min(minScore, score);
        }
      }
      return minScore;
    }
  }

  checkWin(board) {
    for (const pattern of this.winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], pattern };
      }
    }
    return null;
  }

  isBoardFull(board) {
    return board.every(cell => cell !== null);
  }

  handleEnd(winInfo) {
    this.gameOver = true;

    if (winInfo.isDraw) {
      this.scores.ties++;
      this.scoreTieEl.textContent = this.scores.ties;
      this.updateStatus("It's a Draw!", false);
      window.soundEngine.playDefeat();
    } else {
      const { winner, pattern } = winInfo;
      pattern.forEach(idx => this.cells[idx].classList.add('win-line'));

      if (winner === 'X') {
        this.scores.X++;
        this.scoreXEl.textContent = this.scores.X;
        const won = (this.mySymbol === 'X');
        this.updateStatus(won ? '🎉 You Won!' : 'Opponent Won!', won);
        if (won) {
          window.soundEngine.playVictory();
          if (this.hub.confetti) this.hub.confetti.burst(100);
        } else {
          window.soundEngine.playDefeat();
        }
      } else {
        this.scores.O++;
        this.scoreOEl.textContent = this.scores.O;
        const won = (this.mySymbol === 'O');
        this.updateStatus(won ? '🎉 You Won!' : 'Computer (O) Won!', won);
        if (won) {
          window.soundEngine.playVictory();
          if (this.hub.confetti) this.hub.confetti.burst(100);
        } else {
          window.soundEngine.playDefeat();
        }
      }
    }
  }

  updateStatus(msg, isHighlight) {
    this.statusEl.textContent = msg;
    if (isHighlight) {
      this.statusEl.className = 'turn-indicator your-turn';
    } else {
      this.statusEl.className = 'turn-indicator opp-turn';
    }
  }
}

window.TicTacToeGame = TicTacToeGame;
