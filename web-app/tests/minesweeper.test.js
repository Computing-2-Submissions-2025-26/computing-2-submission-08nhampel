/*jslint browser*/
/**
 * minesweeper.test.js
 * Unit tests for the core game rules of the Minesweeper module.
 * Tests focus on behaviour as experienced by a player,
 * not on implementation details.
 */

import Minesweeper from "../minesweeper.js";
import assert from "assert";

// ---------------------------------------------------------------------------
// Helper — build a game with mines at specific positions.
// Bypasses the safe-first-click guarantee for precise test scenarios.
//
// Minesweeper.reveal detects the first move by checking whether every
// cell is unrevealed. To prevent it overwriting our carefully placed
// mines, we pre-reveal the bottom-right cell (provided it is not a mine)
// as a dummy "already played" marker. This makes reveal treat subsequent
// clicks as mid-game moves rather than a first reveal.
// ---------------------------------------------------------------------------

const make_game_with_mines = function (tot_rows, tot_cols, mine_positions) {
    const mine_set = new Set(
        mine_positions.map(function (pos) {
            return pos[0] * tot_cols + pos[1];
        })
    );
    const grid = Array.from({length: tot_rows}, function (ignore, r) {
        return Array.from({length: tot_cols}, function (ignore, c) {
            return Minesweeper.make_cell(mine_set.has(r * tot_cols + c));
        });
    });
    const grid_with_clues = Minesweeper.compute_clues(grid, tot_rows, tot_cols);
    const grid_with_dummy = grid_with_clues.map(function (row_cells, ri) {
        return row_cells.map(function (cell, ci) {
            if (ri === tot_rows - 1 && ci === tot_cols - 1 && !cell.mine) {
                return Object.assign({}, cell, {revealed: true});
            }
            return cell;
        });
    });
    return {
        grid: grid_with_dummy,
        tot_rows,
        tot_cols,
        total_mines: mine_positions.length,
        status: "in_play"
    };
};

// ---------------------------------------------------------------------------
// First click safety
// ---------------------------------------------------------------------------

describe("First click safety", function () {

    it("The first revealed cell is never a mine", function () {
        let i = 0;
        while (i < 20) {
            const game = Minesweeper.make_game(9, 9, 10);
            const result = Minesweeper.reveal(4, 4, game);
            assert.notStrictEqual(
                result.status,
                "lost",
                "First click should never hit a mine"
            );
            i += 1;
        }
    });

    it("First click and its neighbours are all mine-free", function () {
        const game = Minesweeper.make_game(9, 9, 10);
        const result = Minesweeper.reveal(0, 0, game);
        const neighbours = Minesweeper.get_neighbours(0, 0, 9, 9);
        assert.strictEqual(
            result.grid[0][0].mine,
            false,
            "First clicked cell should not be a mine"
        );
        neighbours.forEach(function (pos) {
            assert.strictEqual(
                result.grid[pos[0]][pos[1]].mine,
                false,
                "Neighbours of first click should not be mines"
            );
        });
    });

});

// ---------------------------------------------------------------------------
// Revealing cells
// ---------------------------------------------------------------------------

describe("Revealing cells", function () {

    it("Revealing a mine sets the game status to lost", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const result = Minesweeper.reveal(0, 0, game);
        assert.strictEqual(
            result.status,
            "lost",
            "Status should be lost after revealing a mine"
        );
    });

    it("Revealing a mine marks that cell as revealed", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const result = Minesweeper.reveal(0, 0, game);
        assert.strictEqual(
            result.grid[0][0].revealed,
            true,
            "The hit mine cell should be marked as revealed"
        );
    });

    it("Revealing a safe cell marks it as revealed", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const result = Minesweeper.reveal(0, 1, game);
        assert.strictEqual(
            result.grid[0][1].revealed,
            true,
            "A safe cell should be marked as revealed after clicking"
        );
    });

    it("Revealing an already revealed cell does not change state", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const after_first = Minesweeper.reveal(0, 1, game);
        const after_second = Minesweeper.reveal(0, 1, after_first);
        assert.deepStrictEqual(
            after_first,
            after_second,
            "Revealing a revealed cell should return unchanged game"
        );
    });

    it("Cannot reveal a cell when the game is already over", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const lost_game = Minesweeper.reveal(0, 0, game);
        const after_reveal = Minesweeper.reveal(0, 2, lost_game);
        assert.strictEqual(
            after_reveal.grid[0][2].revealed,
            false,
            "Should not be able to reveal cells after game is over"
        );
    });

    it("Revealing a zero-clue cell cascades to neighbours", function () {
        const game = make_game_with_mines(5, 5, [[4, 4]]);
        const result = Minesweeper.reveal(0, 0, game);
        const neighbours = Minesweeper.get_neighbours(0, 0, 5, 5);
        neighbours.forEach(function (pos) {
            assert.strictEqual(
                result.grid[pos[0]][pos[1]].revealed,
                true,
                "Neighbours of zero-clue cell should be cascade-revealed"
            );
        });
    });

});

// ---------------------------------------------------------------------------
// Flagging cells
// ---------------------------------------------------------------------------

describe("Flagging cells", function () {

    it("Flagging an unrevealed cell marks it as flagged", function () {
        const game = Minesweeper.make_game(9, 9, 10);
        const result = Minesweeper.flag(0, 0, game);
        assert.strictEqual(
            result.grid[0][0].flagged,
            true,
            "Cell should be flagged after calling flag"
        );
    });

    it("Flagging a flagged cell removes the flag (toggle)", function () {
        const game = Minesweeper.make_game(9, 9, 10);
        const flagged = Minesweeper.flag(0, 0, game);
        const unflagged = Minesweeper.flag(0, 0, flagged);
        assert.strictEqual(
            unflagged.grid[0][0].flagged,
            false,
            "Flagging a flagged cell should remove the flag"
        );
    });

    it("A flagged cell cannot be revealed", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const flagged = Minesweeper.flag(0, 0, game);
        const result = Minesweeper.reveal(0, 0, flagged);
        assert.strictEqual(
            result.grid[0][0].revealed,
            false,
            "A flagged cell should not be revealed on click"
        );
    });

    it("A revealed cell cannot be flagged", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const revealed = Minesweeper.reveal(0, 1, game);
        const result = Minesweeper.flag(0, 1, revealed);
        assert.strictEqual(
            result.grid[0][1].flagged,
            false,
            "A revealed cell should not be flaggable"
        );
    });

    it("Cannot flag a cell when the game is already over", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const lost_game = Minesweeper.reveal(0, 0, game);
        const result = Minesweeper.flag(0, 2, lost_game);
        assert.strictEqual(
            result.grid[0][2].flagged,
            false,
            "Should not be able to flag cells after game is over"
        );
    });

});

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

describe("Win condition", function () {

    it("Game is not won on a fresh board", function () {
        const game = Minesweeper.make_game(9, 9, 10);
        assert.strictEqual(
            Minesweeper.check_win(game),
            false,
            "A fresh unplayed board should not be won"
        );
    });

    it("Revealing all non-mine cells wins the game", function () {
        const game = make_game_with_mines(2, 2, [[0, 0]]);
        const step1 = Minesweeper.reveal(0, 1, game);
        const step2 = Minesweeper.reveal(1, 0, step1);
        assert.strictEqual(
            step2.status,
            "won",
            "Revealing all non-mine cells should win the game"
        );
    });

    it("Game is not won while unrevealed safe cells remain", function () {
        const game = make_game_with_mines(3, 3, [
            [0, 0], [0, 1], [0, 2]
        ]);
        const step1 = Minesweeper.reveal(1, 0, game);
        assert.strictEqual(
            Minesweeper.check_win(step1),
            false,
            "Game should not be won while safe cells remain unrevealed"
        );
    });

    it("Flagging all mines does not win the game", function () {
        const game = make_game_with_mines(2, 2, [[0, 0]]);
        const result = Minesweeper.flag(0, 0, game);
        assert.strictEqual(
            result.status,
            "in_play",
            "Flagging mines alone should not win the game"
        );
    });

});

// ---------------------------------------------------------------------------
// Chord
// ---------------------------------------------------------------------------

describe("Chord", function () {

    it("Chord does nothing if flag count does not match clue", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const revealed = Minesweeper.reveal(0, 1, game);
        const result = Minesweeper.chord(0, 1, revealed);
        assert.deepStrictEqual(
            result,
            revealed,
            "Chord should do nothing if flags do not match the clue"
        );
    });

    it("Chord reveals neighbours when flag count matches clue", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const revealed = Minesweeper.reveal(0, 1, game);
        const flagged1 = Minesweeper.flag(0, 0, revealed);
        const flagged2 = Minesweeper.flag(1, 1, flagged1);
        const result = Minesweeper.chord(0, 1, flagged2);
        assert.strictEqual(
            result.grid[0][2].revealed,
            true,
            "Chord should reveal unflagged neighbours"
        );
    });

    it("Chord on an unrevealed cell does nothing", function () {
        const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
        const result = Minesweeper.chord(0, 1, game);
        assert.deepStrictEqual(
            result,
            game,
            "Chord on unrevealed cell should return game unchanged"
        );
    });

    it("Chord on a zero-clue cell does nothing", function () {
        const game = make_game_with_mines(5, 5, [[4, 4]]);
        const revealed = Minesweeper.reveal(0, 0, game);
        const result = Minesweeper.chord(0, 0, revealed);
        assert.deepStrictEqual(
            result,
            revealed,
            "Chord on zero-clue cell should return game unchanged"
        );
    });

    it(
        "Chord with a misplaced flag reveals a mine and loses the game",
        function () {
            // Mine at (0,0) only. Cell (0,1) has clue 1.
            // Player flags (0,2) by mistake instead of (0,0), then
            // chords (0,1). This reveals (0,0) — the actual mine.
            const game = make_game_with_mines(3, 3, [[0, 0]]);
            const revealed = Minesweeper.reveal(0, 1, game);
            const wrong_flag = Minesweeper.flag(0, 2, revealed);
            const result = Minesweeper.chord(0, 1, wrong_flag);
            assert.strictEqual(
                result.status,
                "lost",
                "Chording with a misplaced flag should lose the game"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Cascade boundary
// ---------------------------------------------------------------------------

describe("Cascade boundary", function () {

    it("Cascade does not reveal cells beyond a numbered cell", function () {
        // Mine at (0,0). Cell (0,1) has clue 1 so cascade stops there.
        // Cell (0,2) is beyond the numbered boundary and should stay hidden.
        const game = make_game_with_mines(3, 3, [[0, 0], [2, 2]]);
        const result = Minesweeper.reveal(2, 0, game);
        assert.strictEqual(
            result.grid[0][2].revealed,
            false,
            "Cascade should not reveal cells beyond a numbered boundary"
        );
    });

    it("Cascade reveals all connected zero-clue cells", function () {
        // Mine only at (4,4) — far corner. Revealing (0,0) should
        // cascade across the whole top-left region.
        const game = make_game_with_mines(5, 5, [[4, 4]]);
        const result = Minesweeper.reveal(0, 0, game);
        assert.strictEqual(
            result.grid[0][2].revealed,
            true,
            "Cascade should spread across all connected zero-clue cells"
        );
    });

});