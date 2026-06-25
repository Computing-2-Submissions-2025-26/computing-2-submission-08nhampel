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
//
// Usage: make_game_with_mines(3, 3, [[0, 0], [1, 1]])
// Creates a 3x3 grid with mines at row 0 col 0, and row 1 col 1.
// ---------------------------------------------------------------------------

const make_game_with_mines = function (tot_rows, tot_cols, mine_positions) {
    // Convert [row, col] positions to flat indices for fast lookup.
    const mine_set = new Set(
        mine_positions.map(function (pos) {
            return pos[0] * tot_cols + pos[1];
        })
    );
    // Build the grid — each cell is mine or safe based on the set above.
    const grid = Array.from({length: tot_rows}, function (ignore, r) {
        return Array.from({length: tot_cols}, function (ignore, c) {
            return Minesweeper.make_cell(mine_set.has(r * tot_cols + c));
        });
    });
    // Compute clue numbers for all non-mine cells.
    const grid_with_clues = Minesweeper.compute_clues(
        grid,
        tot_rows,
        tot_cols
    );
    // Pre-reveal the bottom-right cell as a dummy move marker,
    // provided it is not a mine. This prevents reveal from treating
    // subsequent calls as a first move and re-placing mines.
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

    // Repeated 20 times to account for randomness in mine placement.
    // A single run could pass by luck; 20 runs make accidental passing
    // extremely unlikely.
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

    // Checks the revealed cell AND all 8 neighbours are mine-free.
    // This verifies the safe zone guarantee — not just the clicked cell.
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

    // Verifies the game ends immediately when a mine is revealed.
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

    // Verifies the mine cell itself is marked revealed so the UI
    // can display the bomb emoji on it.
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

    // Basic reveal — verifies a safe cell transitions to revealed.
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

    // Verifies idempotency — revealing the same cell twice is harmless.
    // Uses deepStrictEqual to check the entire game state is unchanged,
    // not just the one cell.
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

    // Verifies the game is locked after it ends — no further reveals
    // should change any cell state.
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

    // Verifies cascade — revealing an empty cell (0 mine neighbours)
    // should automatically reveal all its neighbours too.
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

    // Verifies cascade stops correctly — cells beyond a numbered cell
    // (one that has mine neighbours) must NOT be auto-revealed.
    // Two cells are checked to make the boundary more robust.
    it(
        "Given a game in play where an empty cell is surrounded by" +
        " numbered cells," +
        "\nWhen the player reveals that empty cell," +
        "\nThen auto-reveal stops at the numbered cells and does not" +
        " go beyond them",
        function () {
            // Board layout (M = mine, numbers = clue values):
            // M  1  M
            // 1  2  1
            // 0  1  0
            // Revealing (2,0) — clue 0 — cascades to (2,1) and (1,0)
            // but stops at numbered cells. (0,1) and (0,2) must stay hidden.
            const game = make_game_with_mines(3, 3, [[0, 0], [0, 2]]);
            const result = Minesweeper.reveal(2, 0, game);
            // These cells are beyond the numbered boundary — must stay hidden
            assert.strictEqual(
                result.grid[0][1].revealed,
                false,
                "Cell beyond numbered boundary must not be auto-revealed"
            );
            assert.strictEqual(
                result.grid[0][2].revealed,
                false,
                "Mine cell beyond boundary must not be auto-revealed"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Flagging cells
// ---------------------------------------------------------------------------

describe("Flagging cells", function () {

    // Basic flag — verifies an unrevealed cell can be flagged.
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

    // Verifies the toggle — flagging the same cell twice removes the flag.
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

    // Verifies flags protect cells — a flagged mine cell should not
    // be accidentally revealed if the player clicks it.
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

    // Verifies revealed cells cannot be flagged — once uncovered
    // a cell is committed and cannot be marked with a flag.
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

    // Verifies the game is locked after it ends — no flags should
    // be placeable once the game is over.
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

    // Verifies the starting state is not won — no cells revealed yet.
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

    // Verifies the win condition triggers correctly by revealing every
    // safe cell one by one on a minimal 2x2 board with one mine.
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

    // Verifies the game is not prematurely won while safe cells remain.
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

    // Verifies flags alone do not trigger a win. A safe cell is revealed
    // first to place mines, then the mine is flagged. The two assertions
    // confirm: (a) the flag was actually placed, and (b) status is still
    // in_play — so we know the flag is what was tested, not a no-op.
    it(
        "Given a game in play with mines on the board," +
        "\nWhen the player flags all the mines but reveals no cells," +
        "\nThen the game is not won — flags alone cannot win the game",
        function () {
            const game = make_game_with_mines(2, 2, [[0, 0]]);
            // Reveal a safe cell first so mines are placed, then flag
            // the mine. All mines are flagged but safe cells unrevealed.
            const after_reveal = Minesweeper.reveal(0, 1, game);
            const result = Minesweeper.flag(0, 0, after_reveal);
            assert.strictEqual(
                result.grid[0][0].flagged,
                true,
                "Mine should be flagged — confirms the flag operation ran"
            );
            assert.strictEqual(
                result.status,
                "in_play",
                "Flagging all mines should not win — must reveal safe cells"
            );
        }
    );

});

// ---------------------------------------------------------------------------
// Chord
// ---------------------------------------------------------------------------

describe("Chord", function () {

    // Verifies chord does nothing when the flag count does not yet match
    // the cell's number. Checks two specific neighbours directly as well
    // as the full game state — so a buggy chord that only partially
    // reveals would still be caught.
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
            // Verify the specific neighbours were not revealed
            assert.strictEqual(
                result.grid[0][2].revealed,
                false,
                "Unflagged neighbour should not be revealed by chord"
            );
            assert.strictEqual(
                result.grid[1][2].revealed,
                false,
                "Another neighbour should not be revealed by chord"
            );
            assert.deepStrictEqual(
                result,
                revealed,
                "Chord should return the game completely unchanged"
            );
        }
    );

    // Verifies the happy path — correct flag placement triggers chord
    // and reveals the remaining neighbours.
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

    // Verifies chord is a no-op on unrevealed cells — it only applies
    // to already-revealed numbered cells.
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

    // Verifies the dangerous chord case — if the player misplaces a flag
    // on a safe cell and chords, the actual mine gets revealed and the
    // game is lost. This is valid game behaviour, not a bug.
    it(
        "Given a revealed numbered cell where a flag has been placed" +
        " on a safe cell by mistake," +
        "\nWhen the player clicks that number to auto-reveal neighbours," +
        "\nThen the actual mine is revealed and the game is lost",
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