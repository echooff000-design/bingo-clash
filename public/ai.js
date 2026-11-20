/**
 * Bingo AI Engine
 * Provides intelligent single-player bot logic with difficulty levels and strategic number selection.
 */
class BingoAI {
  constructor(difficulty = 'smart') {
    this.difficulty = difficulty; // 'casual', 'smart', 'mastermind'
    this.board = [];
    this.calledNumbers = new Set();
    this.lines = 0;
    this.completedLinesIndices = new Set();
    this.generateBoard();
  }

  reset() {
    this.board = [];
    this.calledNumbers.clear();
    this.lines = 0;
    this.completedLinesIndices.clear();
    this.generateBoard();
  }

  generateBoard() {
    // Generate a shuffled array of 1 to 25
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    this.board = nums;
  }

  // Get all 12 win lines (indices 0..24)
  static getLines() {
    const lines = [];
    // 5 Rows
    for (let r = 0; r < 5; r++) {
      lines.push([r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4]);
    }
    // 5 Columns
    for (let c = 0; c < 5; c++) {
      lines.push([c, c + 5, c + 10, c + 15, c + 20]);
    }
    // 2 Diagonals
    lines.push([0, 6, 12, 18, 24]);
    lines.push([4, 8, 12, 16, 20]);
    return lines;
  }

  markNumber(num) {
    this.calledNumbers.add(num);
    this.checkLines();
  }

  checkLines() {
    const allLines = BingoAI.getLines();
    let count = 0;
    const completed = new Set();

    allLines.forEach((line, index) => {
      const isComplete = line.every(idx => this.calledNumbers.has(this.board[idx]));
      if (isComplete) {
        count++;
        completed.add(index);
      }
    });

    this.lines = Math.min(5, count);
    this.completedLinesIndices = completed;
    return this.lines;
  }

  // Intelligent selection algorithm
  chooseNumber() {
    // Candidate numbers: numbers on the AI board that haven't been called
    const uncalled = this.board.filter(n => !this.calledNumbers.has(n));
    if (uncalled.length === 0) return null;

    if (this.difficulty === 'casual' && Math.random() < 0.35) {
      // Pick random
      const randIdx = Math.floor(Math.random() * uncalled.length);
      return uncalled[randIdx];
    }

    const allLines = BingoAI.getLines();
    let bestNum = uncalled[0];
    let maxScore = -1;

    for (const num of uncalled) {
      const cellIdx = this.board.indexOf(num);
      let score = 0;

      // Find all lines containing this cell
      for (let lIdx = 0; lIdx < allLines.length; lIdx++) {
        const line = allLines[lIdx];
        if (!line.includes(cellIdx)) continue;

        // Count how many numbers are already called in this line
        let calledInLine = 0;
        for (const idx of line) {
          if (this.calledNumbers.has(this.board[idx])) {
            calledInLine++;
          }
        }

        // Weighting system:
        // 4 called -> this pick completes the line!
        if (calledInLine === 4) {
          score += 500;
        } else if (calledInLine === 3) {
          score += 100;
        } else if (calledInLine === 2) {
          score += 25;
        } else {
          score += 5;
        }
      }

      // Bonus for center cell (index 12) which intersects 4 lines (row 2, col 2, and both diagonals)
      if (cellIdx === 12) score += 30;
      // Bonus for corners (index 0, 4, 20, 24) which intersect 3 lines
      if ([0, 4, 20, 24].includes(cellIdx)) score += 15;

      // Add a tiny random jitter so it doesn't feel robotic when scores tie
      score += Math.random() * 2;

      if (score > maxScore) {
        maxScore = score;
        bestNum = num;
      }
    }

    return bestNum;
  }
}

window.BingoAI = BingoAI;
