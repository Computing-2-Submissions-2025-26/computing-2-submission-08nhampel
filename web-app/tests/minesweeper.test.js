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
    const grid_with_clues = Minesweeper.compute_clues(
        grid,
        tot_rows,
        tot_cols
    );
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

    it(
        "Given a fresh game that has not been played," +
        "\nWhen the player reveals any cell for the first time," +
        "\nThen that cell is never a mine — the first click is always safe",
        function () {
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
        }
    );

    it(
        "Given a fresh game that has not been played," +
        "\nWhen the player makes their first reveal," +
        "\nThen the revealed cell and all its neighbours are mine-free",
        function () {
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
        }
    );

});

// ---------------------------------------------------------------------------
// Revealing cells
// ---------------------------------------------------------------------------

describe("Revealing cells", function () {

    it(
        "Given a game in play with a mine at a known position," +
        "\nWhen the player reveals that mine cell," +
        "\nThen the game status becomes lost",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const result = Minesweeper.reveal(0, 0, game);
            assert.strictEqual(
                result.status,
                "lost",
                "Status should be lost after revealing a mine"
            );
        }
    );

    it(
        "Given a game in play with a mine at a known position," +
        "\nWhen the player reveals that mine cell," +
        "\nThen that cell is marked as revealed so the UI can show it",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const result = Minesweeper.reveal(0, 0, game);
            assert.strictEqual(
                result.grid[0][0].revealed,
                true,
                "The hit mine cell should be marked as revealed"
            );
        }
    );

    it(
        "Given a game in play with a safe cell at a known position," +
        "\nWhen the player reveals that cell," +
        "\nThen that cell is marked as revealed",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const result = Minesweeper.reveal(0, 1, game);
            assert.strictEqual(
                result.grid[0][1].revealed,
                true,
                "A safe cell should be marked as revealed after clicking"
            );
        }
    );

    it(
        "Given a game in play with a cell already revealed," +
        "\nWhen the player reveals that same cell again," +
        "\nThen the game state is completely unchanged",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const after_first = Minesweeper.reveal(0, 1, game);
            const after_second = Minesweeper.reveal(0, 1, after_first);
            assert.deepStrictEqual(
                after_first,
                after_second,
                "Revealing a revealed cell should return unchanged game"
            );
        }
    );

    it(
        "Given a game that has already ended," +
        "\nWhen the player attempts to reveal another cell," +
        "\nThen the game state is unchanged and no new cells are revealed",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const lost_game = Minesweeper.reveal(0, 0, game);
            const after_reveal = Minesweeper.reveal(0, 2, lost_game);
            assert.strictEqual(
                after_reveal.grid[0][2].revealed,
                false,
                "Should not be able to reveal cells after game is over"
            );
        }
    );

    it(
        "Given a game in play where a cell has no mine neighbours," +
        "\nWhen the player reveals that empty cell," +
        "\nThen all surrounding cells are automatically revealed too",
        function () {
            const game = make_game_with_mines(5, 5, [[4, 4]]);
            const result = Minesweeper.reveal(0, 0, game);
            const neighbours = Minesweeper.get_neighbours(0, 0, 5, 5);
            neighbours.forEach(function (pos) {
                assert.strictEqual(
                    result.grid[pos[0]][pos[1]].revealed,
                    true,
                    "Neighbours of an empty cell should be auto-revealed"
                );
            });
        }
    );

    it(
        "Given a game in play where an empty cell is surrounded by" +
        " numbered cells," +
        "\nWhen the player reveals that empty cell," +
        "\nThen auto-reveal stops at the numbered cells and does not" +
        " go beyond them",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [2, 2]]);
            const result = Minesweeper.reveal(2, 0, game);
            assert.strictEqual(
                result.grid[0][2].revealed,
                false,
                "Auto-reveal should not go beyond numbered boundary cells"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Flagging cells
// ---------------------------------------------------------------------------

describe("Flagging cells", function () {

    it(
        "Given a game in play with an unrevealed cell," +
        "\nWhen the player flags that cell," +
        "\nThen the cell is marked as flagged",
        function () {
            const game = Minesweeper.make_game(9, 9, 10);
            const result = Minesweeper.flag(0, 0, game);
            assert.strictEqual(
                result.grid[0][0].flagged,
                true,
                "Cell should be flagged after calling flag"
            );
        }
    );

    it(
        "Given a game in play with a flagged cell," +
        "\nWhen the player flags that same cell again," +
        "\nThen the flag is removed — flagging toggles on and off",
        function () {
            const game = Minesweeper.make_game(9, 9, 10);
            const flagged = Minesweeper.flag(0, 0, game);
            const unflagged = Minesweeper.flag(0, 0, flagged);
            assert.strictEqual(
                unflagged.grid[0][0].flagged,
                false,
                "Flagging a flagged cell should remove the flag"
            );
        }
    );

    it(
        "Given a game in play with a flagged cell," +
        "\nWhen the player tries to reveal that flagged cell," +
        "\nThen the cell stays hidden — flags protect cells from reveal",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const flagged = Minesweeper.flag(0, 0, game);
            const result = Minesweeper.reveal(0, 0, flagged);
            assert.strictEqual(
                result.grid[0][0].revealed,
                false,
                "A flagged cell should not be revealed on click"
            );
        }
    );

    it(
        "Given a game in play with a revealed cell," +
        "\nWhen the player tries to flag that revealed cell," +
        "\nThen the flag is not applied — revealed cells cannot be flagged",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const revealed = Minesweeper.reveal(0, 1, game);
            const result = Minesweeper.flag(0, 1, revealed);
            assert.strictEqual(
                result.grid[0][1].flagged,
                false,
                "A revealed cell should not be flaggable"
            );
        }
    );

    it(
        "Given a game that has already ended," +
        "\nWhen the player tries to flag a cell," +
        "\nThen the flag is not applied — no actions are possible after" +
        " the game ends",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const lost_game = Minesweeper.reveal(0, 0, game);
            const result = Minesweeper.flag(0, 2, lost_game);
            assert.strictEqual(
                result.grid[0][2].flagged,
                false,
                "Should not be able to flag cells after game is over"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

describe("Win condition", function () {

    it(
        "Given a fresh game that has not been played," +
        "\nWhen we check if the game is won," +
        "\nThen it is not won — no cells have been revealed yet",
        function () {
            const game = Minesweeper.make_game(9, 9, 10);
            assert.strictEqual(
                Minesweeper.check_win(game),
                false,
                "A fresh unplayed board should not be won"
            );
        }
    );

    it(
        "Given a game in play where only mine cells remain hidden," +
        "\nWhen the player reveals the last safe cell," +
        "\nThen the game status becomes won",
        function () {
            const game = make_game_with_mines(2, 2, [[0, 0]]);
            const step1 = Minesweeper.reveal(0, 1, game);
            const step2 = Minesweeper.reveal(1, 0, step1);
            assert.strictEqual(
                step2.status,
                "won",
                "Revealing all non-mine cells should win the game"
            );
        }
    );

    it(
        "Given a game in play where some safe cells are still hidden," +
        "\nWhen we check if the game is won," +
        "\nThen it is not won — all safe cells must be revealed to win",
        function () {
            const game = make_game_with_mines(3, 3, [
                [0, 0], [0, 1], [0, 2]
            ]);
            const step1 = Minesweeper.reveal(1, 0, game);
            assert.strictEqual(
                Minesweeper.check_win(step1),
                false,
                "Game should not be won while safe cells remain unrevealed"
            );
        }
    );

    it(
        "Given a game in play with mines on the board," +
        "\nWhen the player flags all the mines but reveals no cells," +
        "\nThen the game is not won — flags alone cannot win the game",
        function () {
            const game = make_game_with_mines(2, 2, [[0, 0]]);
            const result = Minesweeper.flag(0, 0, game);
            assert.strictEqual(
                result.status,
                "in_play",
                "Flagging mines alone should not win the game"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Chord
// ---------------------------------------------------------------------------

describe("Chord", function () {

    it(
        "Given a revealed numbered cell with fewer flags around it" +
        " than its number indicates," +
        "\nWhen the player clicks that number," +
        "\nThen nothing happens — the flag count must match the number" +
        " before neighbours are auto-revealed",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const revealed = Minesweeper.reveal(0, 1, game);
            const result = Minesweeper.chord(0, 1, revealed);
            assert.deepStrictEqual(
                result,
                revealed,
                "Chord should do nothing if flags do not match the clue"
            );
        }
    );

    it(
        "Given a revealed numbered cell with exactly the right number" +
        " of flags placed around it," +
        "\nWhen the player clicks that number," +
        "\nThen all remaining unflagged neighbours are revealed",
        function () {
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
        }
    );

    it(
        "Given an unrevealed cell," +
        "\nWhen the player tries to chord that cell," +
        "\nThen nothing happens — only revealed numbered cells can be" +
        " chorded",
        function () {
            const game = make_game_with_mines(3, 3, [[0, 0], [1, 1]]);
            const result = Minesweeper.chord(0, 1, game);
            assert.deepStrictEqual(
                result,
                game,
                "Chord on unrevealed cell should return game unchanged"
            );
        }
    );

    it(
        "Given a revealed numbered cell where a flag has been placed" +
        " on a safe cell by mistake," +
        "\nWhen the player clicks that number to auto-reveal neighbours," +
        "\nThen the actual mine is revealed and the game is lost",
        function () {
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