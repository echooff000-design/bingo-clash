/**
 * Ludo Duel - 2-Player Classic Fast Board Game
 * Single-Player vs Computer Bot & Online Real-time 1v1 Duel
 */
class LudoGame {
  constructor(hub) {
    this.hub = hub;
    this.mode = 'ai'; // 'ai' or 'online'
    this.myColor = 'red';
    this.currentTurnColor = 'red';
    this.diceValue = 1;
    this.isRolling = false;
    this.canRoll = true;
    this.gameOver = false;

    // Tokens state: 4 tokens per player
    // -1 = In Base, 0-51 = Main Track, 52-56 = Home Column, 57 = Finished Home
    this.tokens = {
      red: [-1, -1, -1, -1],
      green: [-1, -1, -1, -1]
    };

    // Safe squares (indices in Red's perspective: 0, 8, 13, 21, 26, 34, 39, 47)
    this.safeSpots = [0, 8, 13, 21, 26, 34, 39, 47];

    this.initDOM();
  }

  initDOM() {
    this.diceBtn = document.getElementById('ludo-dice-btn');
    this.diceFace = document.getElementById('ludo-dice-face');
    this.statusEl = document.getElementById('ludo-status');
    this.redHomeEl = document.getElementById('ludo-red-home-tokens');
    this.greenHomeEl = document.getElementById('ludo-green-home-tokens');
    this.boardTrackEl = document.getElementById('ludo-track-container');
    this.btnRestart = document.getElementById('btn-ludo-restart');

    if (this.diceBtn) {
      this.diceBtn.addEventListener('click', () => {
        this.handleDiceRoll();
      });
    }

    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => {
        if (this.mode === 'ai') {
          this.startAIMode();
        } else if (this.hub.socket && this.hub.roomId) {
          this.hub.socket.emit('request-rematch');
        }
      });
    }

    this.renderBoard();
  }

  startAIMode() {
    this.mode = 'ai';
    this.myColor = 'red';
    this.currentTurnColor = 'red';
    this.gameOver = false;
    this.canRoll = true;
    this.isRolling = false;
    this.diceValue = null;
    this.tokens = {
      red: [-1, -1, -1, -1],
      green: [-1, -1, -1, -1]
    };

    this.renderBoard();
    this.updateStatus('Your Turn (Red)! Roll the Dice 🎲', true);
    this.updateDiceUI(1);
  }

  handleDiceRoll() {
    if (this.gameOver || this.isRolling || !this.canRoll) return;

    if (this.mode === 'ai' && this.currentTurnColor !== 'red') return;

    if (this.mode === 'ai') {
      this.animateDiceRoll((val) => {
        this.onDiceRolled(val);
      });
    } else if (this.mode === 'online' && this.hub.socket) {
      this.hub.socket.emit('ludo-roll-dice');
    }
  }

  animateDiceRoll(callback) {
    this.isRolling = true;
    this.canRoll = false;
    window.soundEngine.playPop();

    let rollCount = 0;
    const interval = setInterval(() => {
      const rand = Math.floor(Math.random() * 6) + 1;
      this.updateDiceUI(rand);
      rollCount++;
      if (rollCount > 8) {
        clearInterval(interval);
        const finalVal = Math.floor(Math.random() * 6) + 1;
        this.updateDiceUI(finalVal);
        this.diceValue = finalVal;
        this.isRolling = false;
        callback(finalVal);
      }
    }, 60);
  }

  updateDiceUI(val) {
    if (!this.diceFace) return;
    const diceDots = {
      1: ['center'],
      2: ['top-left', 'bottom-right'],
      3: ['top-left', 'center', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right']
    };

    this.diceFace.innerHTML = '';
    const dots = diceDots[val] || diceDots[1];
    dots.forEach(pos => {
      const dot = document.createElement('span');
      dot.className = `dice-dot dot-${pos}`;
      this.diceFace.appendChild(dot);
    });
  }

  onDiceRolled(dice) {
    const color = this.currentTurnColor;
    const myTokens = this.tokens[color];

    // Find movable tokens
    const movableIndices = [];
    myTokens.forEach((pos, idx) => {
      if (pos === -1 && dice === 6) movableIndices.push(idx);
      else if (pos >= 0 && (pos + dice) <= 57) movableIndices.push(idx);
    });

    if (movableIndices.length === 0) {
      this.updateStatus(`Rolled ${dice}! No valid moves. Passing turn...`, false);
      setTimeout(() => {
        this.switchTurn();
      }, 1100);
      return;
    }

    if (color === 'red') {
      // If only 1 token is movable, auto-move it for smooth UX!
      if (movableIndices.length === 1) {
        this.updateStatus(`Rolled ${dice}! Auto-moving token...`, true);
        setTimeout(() => this.moveToken('red', movableIndices[0]), 300);
      } else {
        this.updateStatus(`Rolled ${dice}! Tap a highlighted token to move.`, true);
        this.highlightMovableTokens(movableIndices);
      }
    } else {
      // AI move
      setTimeout(() => {
        const bestToken = this.chooseAIToken(movableIndices, dice);
        this.moveToken('green', bestToken);
      }, 700);
    }
  }

  highlightMovableTokens(indices) {
    const tokenEls = document.querySelectorAll('.ludo-token.color-red');
    tokenEls.forEach(el => {
      const idx = parseInt(el.dataset.tokenIndex, 10);
      if (indices.includes(idx)) {
        el.classList.add('movable-highlight');
        el.onclick = () => {
          this.clearHighlights();
          this.moveToken('red', idx);
        };
      }
    });
  }

  clearHighlights() {
    const tokenEls = document.querySelectorAll('.ludo-token');
    tokenEls.forEach(el => {
      el.classList.remove('movable-highlight');
      el.onclick = null;
    });
  }

  moveToken(color, tokenIndex) {
    const dice = this.diceValue;
    const tokens = this.tokens[color];
    const oppColor = color === 'red' ? 'green' : 'red';
    const oppTokens = this.tokens[oppColor];
    let pos = tokens[tokenIndex];

    let captured = false;
    if (pos === -1 && dice === 6) {
      tokens[tokenIndex] = 0; // Move out to start
      window.soundEngine.playStrike();
    } else if (pos >= 0 && (pos + dice) <= 57) {
      tokens[tokenIndex] = pos + dice;
      window.soundEngine.playPop();

      // Check capture on main track
      const newPos = tokens[tokenIndex];
      if (newPos >= 0 && newPos <= 50) {
        const isSafe = this.safeSpots.includes(newPos);
        if (!isSafe) {
          const oppEquivalent = (newPos + 26) % 52;
          oppTokens.forEach((oppP, oIdx) => {
            if (oppP === oppEquivalent) {
              oppTokens[oIdx] = -1; // Send back to base!
              captured = true;
              window.soundEngine.playVictory();
            }
          });
        }
      }
    }

    this.renderBoard();

    // Check Victory
    const won = tokens.every(p => p === 57);
    if (won) {
      this.gameOver = true;
      const isMe = (color === this.myColor);
      this.updateStatus(isMe ? '🏆 YOU WON THE LUDO DUEL!' : 'Computer Won!', isMe);
      if (isMe) {
        window.soundEngine.playVictory();
        if (this.hub.confetti) this.hub.confetti.burst(120);
      } else {
        window.soundEngine.playDefeat();
      }
      return;
    }

    // Bonus roll on 6 or capture!
    if (dice === 6 || captured) {
      this.canRoll = true;
      this.updateStatus(`${color === 'red' ? 'You' : 'Computer'} earned a BONUS ROLL! 🎲`, color === 'red');
      if (color === 'green') {
        setTimeout(() => this.runAITurn(), 900);
      }
    } else {
      this.switchTurn();
    }
  }

  switchTurn() {
    this.currentTurnColor = this.currentTurnColor === 'red' ? 'green' : 'red';
    this.canRoll = (this.currentTurnColor === 'red');

    if (this.currentTurnColor === 'red') {
      this.updateStatus('Your Turn (Red)! Roll the Dice 🎲', true);
    } else {
      this.updateStatus('Computer is rolling...', false);
      setTimeout(() => this.runAITurn(), 800);
    }
  }

  runAITurn() {
    if (this.gameOver) return;
    this.animateDiceRoll((dice) => {
      this.onDiceRolled(dice);
    });
  }

  // Smart heuristic AI decision for Ludo
  chooseAIToken(movable, dice) {
    let best = movable[0];
    let maxScore = -1;

    movable.forEach(idx => {
      const pos = this.tokens.green[idx];
      let score = 0;

      // 1. Prioritize capturing opponent token
      const targetPos = (pos === -1 ? 0 : pos + dice);
      if (targetPos <= 50) {
        const redEquivalent = (targetPos + 26) % 52;
        if (this.tokens.red.includes(redEquivalent)) {
          score += 1000;
        }
      }

      // 2. Prioritize exiting base on 6
      if (pos === -1 && dice === 6) score += 400;

      // 3. Reaching Home finish
      if (pos + dice === 57) score += 800;

      // 4. Entering safe spot
      if (this.safeSpots.includes(targetPos)) score += 150;

      // 5. Prefer moving tokens closer to home
      score += pos * 2;

      if (score > maxScore) {
        maxScore = score;
        best = idx;
      }
    });

    return best;
  }

  renderBoard() {
    // Render Base Tokens
    const redBaseEl = document.getElementById('ludo-red-base-tokens');
    const greenBaseEl = document.getElementById('ludo-green-base-tokens');
    if (redBaseEl) redBaseEl.innerHTML = '';
    if (greenBaseEl) greenBaseEl.innerHTML = '';

    this.tokens.red.forEach((pos, idx) => {
      if (pos === -1 && redBaseEl) {
        const tok = this.createTokenDOM('red', idx);
        redBaseEl.appendChild(tok);
      }
    });

    this.tokens.green.forEach((pos, idx) => {
      if (pos === -1 && greenBaseEl) {
        const tok = this.createTokenDOM('green', idx);
        greenBaseEl.appendChild(tok);
      }
    });

    // Render Track & Home tokens
    const cells = document.querySelectorAll('.ludo-tile');
    cells.forEach(c => (c.innerHTML = c.dataset.tileStar ? '⭐' : ''));

    // Place Red Tokens
    this.tokens.red.forEach((pos, idx) => {
      if (pos >= 0 && pos < 52) {
        const tile = document.getElementById(`ludo-tile-${pos}`);
        if (tile) tile.appendChild(this.createTokenDOM('red', idx));
      } else if (pos >= 52 && pos <= 56) {
        const homeTile = document.getElementById(`ludo-red-home-${pos - 52}`);
        if (homeTile) homeTile.appendChild(this.createTokenDOM('red', idx));
      } else if (pos === 57) {
        const center = document.getElementById('ludo-center-crown');
        if (center) center.appendChild(this.createTokenDOM('red', idx));
      }
    });

    // Place Green Tokens
    this.tokens.green.forEach((pos, idx) => {
      if (pos >= 0 && pos < 52) {
        const actualTileIndex = (pos + 26) % 52;
        const tile = document.getElementById(`ludo-tile-${actualTileIndex}`);
        if (tile) tile.appendChild(this.createTokenDOM('green', idx));
      } else if (pos >= 52 && pos <= 56) {
        const homeTile = document.getElementById(`ludo-green-home-${pos - 52}`);
        if (homeTile) homeTile.appendChild(this.createTokenDOM('green', idx));
      } else if (pos === 57) {
        const center = document.getElementById('ludo-center-crown');
        if (center) center.appendChild(this.createTokenDOM('green', idx));
      }
    });
  }

  createTokenDOM(color, idx) {
    const el = document.createElement('div');
    el.className = `ludo-token color-${color}`;
    el.dataset.color = color;
    el.dataset.tokenIndex = idx;
    el.textContent = idx + 1;
    return el;
  }

  updateStatus(text, isMy) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = isMy ? 'turn-indicator your-turn' : 'turn-indicator opp-turn';
  }
}

window.LudoGame = LudoGame;
