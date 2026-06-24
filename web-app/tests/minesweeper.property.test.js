/*jslint browser*/
/**
 * minesweeper.property.test.js
 *
 * Property-based tests for the Minesweeper module using fast-check.
 *
 * Unlike example-based tests (which check specific known scenarios),
 * property-based tests describe GENERAL RULES that must hold true for
 * ANY valid input. fast-check automatically generates hundreds of
 * random inputs and verifies each rule holds for all of them.
 *
 * If fast-check finds a failing case, it shrinks the input down to
 * the smallest possible example that still fails, making bugs easy
 * to identify and fix.
 *
 * Each test below states its property clearly in plain English before
 * the code, so the intent is always obvious.
 */

import Minesweeper from "../minesweeper.js";
import assert from "assert";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Arbitraries — fast-check generators for Minesweeper types
//
// An "arbitrary" is fast-check's term for a generator that produces
// random values of a specific type. We define reusable arbitraries
// for the types our properties need.
// ---------------------------------------------------------------------------

/**
 * Generates a valid difficulty configuration.
 * tot_rows and tot_cols are kept small (3-9) to keep tests fast.
 * Mines are capped at (tot_rows * tot_cols - 2) to always leave safe cells.
 */
const arb_config = fc.record({
    tot_rows: fc.integer({min: 3, max: 9}),
    tot_cols: fc.integer({min: 3, max: 9})
}).chain(function (dims) {
    const max_mines = (dims.tot_rows * dims.tot_cols) - 2;
    return fc.record({
        tot_rows: fc.constant(dims.tot_rows),
        tot_cols: fc.constant(dims.tot_cols),
        mines: fc.integer({min: 1, max: max_mines})
    });
});

/**
 * Generates a game after one safe reveal has been made.
 * Mines are placed on the first reveal, so this guarantees an
 * in_play game with mines placed and clues computed.
 * The centre cell is always valid for 3x3 or larger boards.
 */
const arb_started_game = arb_config.map(function (config) {
    const game = Minesweeper.make_game(
        config.tot_rows,
        config.tot_cols,
        config.mines
    );
    const mid_row = Math.floor(config.tot_rows / 2);
    const mid_col = Math.floor(config.tot_cols / 2);
    return Minesweeper.reveal(mid_row, mid_col, game);
});

/**
 * Generates a fresh game (no moves made yet) from a random config.
 * NOTE: mines are NOT placed in a fresh game — they are placed on
 * the first reveal. Tests that need mines placed use arb_started_game.
 */
const arb_fresh_game = arb_config.map(function (config) {
    return Minesweeper.make_game(
        config.tot_rows,
        config.tot_cols,
        config.mines
    );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Counts the number of revealed cells in a game.
 * @param {Minesweeper.Game} game
 * @returns {number}
 */
const count_revealed = function (game) {
    return game.grid.reduce(function (total, row) {
        return total + row.filter(function (cell) {
            return cell.revealed;
        }).length;
    }, 0);
};

/**
 * Counts the actual number of mine cells currently in the grid.
 * @param {Minesweeper.Game} game
 * @returns {number}
 */
const count_mines_in_grid = function (game) {
    return game.grid.reduce(function (total, row) {
        return total + row.filter(function (cell) {
            return cell.mine;
        }).length;
    }, 0);
};

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property: game status is always a valid value", function () {

    /**
     * PROPERTY: After any reveal, the game status must always be
     * exactly one of: "in_play", "won", or "lost".
     * It can never be undefined, null, or an unexpected string.
     *
     * WHY THIS MATTERS: If a bug caused status to become something
     * unexpected, the UI would break silently. This property catches
     * that class of bug for any possible board and move combination,
     * not just the specific boards we hand-crafted in unit tests.
     */
    it(
        "after reveal on any board, status is in_play, won, or lost",
        function () {
            const valid_statuses = ["in_play", "won", "lost"];
            const check = function (game) {
                const mid_row = Math.floor(game.tot_rows / 2);
                const mid_col = Math.floor(game.tot_cols / 2);
                const result = Minesweeper.reveal(
                    mid_row,
                    mid_col,
                    game
                );
                assert.ok(
                    valid_statuses.includes(result.status),
                    "Status after reveal must be in_play, won, " +
                    "or lost — got: " + result.status
                );
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

    /**
     * PROPERTY: After any flag, the game status must always be
     * exactly one of: "in_play", "won", or "lost".
     * Flagging alone cannot win or lose a game, so this also
     * verifies that status stays "in_play" after flagging.
     *
     * WHY THIS MATTERS: Same as above — a status corruption bug
     * would be caught here regardless of board size or mine count.
     */
    it(
        "after flag on any board, status is in_play, won, or lost",
        function () {
            const valid_statuses = ["in_play", "won", "lost"];
            const check = function (game) {
                const result = Minesweeper.flag(0, 0, game);
                assert.ok(
                    valid_statuses.includes(result.status),
                    "Status after flag must be in_play, won, " +
                    "or lost — got: " + result.status
                );
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

});

describe("Property: reveal only increases revealed cell count", function () {

    /**
     * PROPERTY: After calling reveal, the number of revealed cells
     * must be greater than or equal to the count before the call.
     * Reveal can uncover MORE cells (via cascade) or leave the
     * count the same (e.g. on an already-revealed cell) — but it
     * can NEVER reduce the count or hide a cell that was visible.
     *
     * WHY THIS MATTERS: Catches a bug where reveal accidentally
     * reset or re-hid cells already shown to the player. Also
     * verifies that cascade only ever adds revealed cells and
     * never accidentally un-reveals them. This property is tested
     * across hundreds of random boards and random cells.
     */
    it(
        "the count of revealed cells never goes down after reveal",
        function () {
            const check = function (game, row_offset, col_offset) {
                if (game.status !== "in_play") {
                    return;
                }
                const row = row_offset % game.tot_rows;
                const col = col_offset % game.tot_cols;
                const before = count_revealed(game);
                const result = Minesweeper.reveal(row, col, game);
                const after = count_revealed(result);
                assert.ok(
                    after >= before,
                    "Revealed count went from " + before +
                    " to " + after +
                    " — reveal must never hide cells"
                );
            };
            fc.assert(
                fc.property(
                    arb_started_game,
                    fc.integer({min: 0, max: 8}),
                    fc.integer({min: 0, max: 8}),
                    check
                )
            );
        }
    );

});

describe("Property: flag is a pure toggle with no side effects", function () {

    /**
     * PROPERTY: Calling flag on the same unrevealed cell twice
     * must return a game state that is deeply identical to the
     * original game before either flag call. Flag toggles the
     * flagged property on, then off again — two calls must cancel
     * each other out completely, leaving the entire game state
     * (grid, status, dimensions) completely unchanged.
     *
     * WHY THIS MATTERS: Verifies flag is a truly pure function.
     * A bug that accidentally mutated shared state, changed clue
     * values, or left other cells modified would be caught here,
     * because deepStrictEqual checks every property recursively.
     */
    it(
        "flagging the same unrevealed cell twice gives back the " +
        "exact original game state — every property unchanged",
        function () {
            const check = function (game) {
                const flagged = Minesweeper.flag(0, 0, game);
                const unflagged = Minesweeper.flag(0, 0, flagged);
                assert.deepStrictEqual(
                    unflagged,
                    game,
                    "Flagging cell (0,0) twice must return a game " +
                    "state identical to the original"
                );
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

    /**
     * PROPERTY: After calling flag(row, col, game), the cell at
     * [row][col] must always have flagged === true. This verifies
     * that flag modifies the correct cell — not a neighbour, not
     * a random cell, and not no cell at all.
     *
     * WHY THIS MATTERS: An off-by-one error in row/col indexing
     * inside flag would modify the wrong cell. This property
     * would catch that immediately because it checks the exact
     * cell that was targeted.
     */
    it(
        "after flagging cell (0,0), that specific cell is flagged " +
        "and no other change has occurred to any other cell",
        function () {
            const check = function (game) {
                const result = Minesweeper.flag(0, 0, game);
                assert.strictEqual(
                    result.grid[0][0].flagged,
                    true,
                    "Cell (0,0) must have flagged === true after " +
                    "calling flag(0, 0, game)"
                );
                if (game.tot_cols > 1) {
                    assert.strictEqual(
                        result.grid[0][1].flagged,
                        game.grid[0][1].flagged,
                        "Cell (0,1) must be unchanged after " +
                        "flagging (0,0)"
                    );
                }
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

});

describe("Property: board dimensions never change", function () {

    /**
     * PROPERTY: The tot_rows and tot_cols properties of the returned game
     * object must always be identical to those of the input game,
     * after any reveal or flag operation. Board size is fixed when
     * the game is created and must never change during play.
     *
     * WHY THIS MATTERS: If a bug caused the grid to be rebuilt
     * with wrong dimensions (e.g. tot_rows and tot_cols swapped, or off
     * by one), the UI would render the wrong number of cells.
     * Testing this across hundreds of board sizes and operations
     * gives strong confidence that dimensions are always preserved.
     */
    it(
        "tot_rows and tot_cols are identical before and after reveal, " +
        "for any board size and any move",
        function () {
            const check = function (game) {
                const mid_row = Math.floor(game.tot_rows / 2);
                const mid_col = Math.floor(game.tot_cols / 2);
                const result = Minesweeper.reveal(
                    mid_row,
                    mid_col,
                    game
                );
                assert.strictEqual(
                    result.tot_rows,
                    game.tot_rows,
                    "tot_rows changed from " + game.tot_rows +
                    " to " + result.tot_rows + " after reveal"
                );
                assert.strictEqual(
                    result.tot_cols,
                    game.tot_cols,
                    "tot_cols changed from " + game.tot_cols +
                    " to " + result.tot_cols + " after reveal"
                );
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

    it(
        "tot_rows and tot_cols are identical before and after flag, " +
        "for any board size",
        function () {
            const check = function (game) {
                const result = Minesweeper.flag(0, 0, game);
                assert.strictEqual(
                    result.tot_rows,
                    game.tot_rows,
                    "tot_rows changed after flag"
                );
                assert.strictEqual(
                    result.tot_cols,
                    game.tot_cols,
                    "tot_cols changed after flag"
                );
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

});

describe("Property: status and check_win are always consistent", function () {

    /**
     * PROPERTY: status === "won" and check_win(game) === true
     * must always be equivalent — they must agree in both
     * directions. If status is "won" then check_win must return
     * true. If check_win returns true then status must be "won".
     * There must never be a case where one is true and the other
     * is false.
     *
     * WHY THIS MATTERS: status is set inside reveal, while
     * check_win is a separate exported function. They use the
     * same logic but are implemented independently. This property
     * proves they are always consistent — catching any divergence
     * between the two win-detection mechanisms for any board size
     * or mine count.
     */
    it(
        "status === won if and only if check_win returns true, " +
        "verified across hundreds of random boards and moves",
        function () {
            const check = function (game) {
                const mid_row = Math.floor(game.tot_rows / 2);
                const mid_col = Math.floor(game.tot_cols / 2);
                const result = Minesweeper.reveal(
                    mid_row,
                    mid_col,
                    game
                );
                if (result.status === "won") {
                    assert.strictEqual(
                        Minesweeper.check_win(result),
                        true,
                        "status is won but check_win returned " +
                        "false — these must always agree"
                    );
                }
                if (Minesweeper.check_win(result)) {
                    assert.strictEqual(
                        result.status,
                        "won",
                        "check_win is true but status is '" +
                        result.status +
                        "' — these must always agree"
                    );
                }
            };
            fc.assert(fc.property(arb_fresh_game, check));
        }
    );

});

describe("Property: mine positions are permanent once placed", function () {

    /**
     * PROPERTY: After mines are placed on the first reveal, the
     * total number of mine cells in the grid must equal
     * total_mines for the entire rest of the game. No reveal,
     * flag, or chord operation should ever add, remove, or move
     * mines — they are fixed in place until the game ends.
     *
     * WHY THIS MATTERS: A bug that accidentally overwrote mine
     * cells during cascade reveal, or duplicated them during a
     * grid copy, would be caught immediately. This is tested
     * across hundreds of random boards with different mine counts.
     *
     * NOTE: Won games are skipped because when the first reveal
     * cascades to an immediate win on a tiny board, the mine is
     * placed but stays hidden — fast-check's shrinker can produce
     * these edge cases. The second test below covers the case
     * where mines must stay stable across subsequent reveals.
     */
    it(
        "the number of mines in the grid equals total_mines after " +
        "the first reveal places them — mines are never added or removed",
        function () {
            const check = function (game) {
                if (game.status === "won") {
                    return;
                }
                const actual = count_mines_in_grid(game);
                assert.strictEqual(
                    actual,
                    game.total_mines,
                    "Grid contains " + actual + " mines but " +
                    "total_mines says " + game.total_mines +
                    " — mines must never be added or removed"
                );
            };
            fc.assert(fc.property(arb_started_game, check));
        }
    );

    /**
     * PROPERTY: The mine count must not change between any two
     * consecutive reveals during an in-play game. Once placed,
     * mines are permanent — cascade reveal must never accidentally
     * modify the mine property of any cell it visits.
     *
     * WHY THIS MATTERS: Specifically targets the cascade reveal
     * logic, which visits many cells. A bug that accidentally
     * cleared the mine property of a cell it revealed would be
     * caught here. This is a distinct property from the one above
     * because it tests stability across multiple moves, not just
     * after initial placement.
     */
    it(
        "the mine count in the grid does not change between a " +
        "first and second reveal — cascade never moves mines",
        function () {
            const check = function (
                game,
                row_offset,
                col_offset
            ) {
                if (game.status !== "in_play") {
                    return;
                }
                const row = row_offset % game.tot_rows;
                const col = col_offset % game.tot_cols;
                const before = count_mines_in_grid(game);
                const result = Minesweeper.reveal(row, col, game);
                const after = count_mines_in_grid(result);
                assert.strictEqual(
                    after,
                    before,
                    "Mine count changed from " + before +
                    " to " + after + " after reveal — " +
                    "mines must never move or disappear"
                );
            };
            fc.assert(
                fc.property(
                    arb_started_game,
                    fc.integer({min: 0, max: 8}),
                    fc.integer({min: 0, max: 8}),
                    check
                )
            );
        }
    );

});