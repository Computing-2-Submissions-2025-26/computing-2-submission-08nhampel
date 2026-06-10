/*jslint browser*/
import R from "./ramda.js";

/**
 * Minesweeper.js is a module to model and play Minesweeper.
 * https://en.wikipedia.org/wiki/Minesweeper_(video_game)
 * @namespace Minesweeper
 * @author [Your Name]
 * @version 2025
 */
const Minesweeper = Object.create(null);

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * A Cell is an individual space on the Minesweeper grid.
 * @memberof Minesweeper
 * @typedef {Object} Cell
 * @property {boolean} mine - Whether this cell contains a mine.
 * @property {boolean} flagged - Whether the player has flagged this cell.
 * @property {boolean} revealed - Whether this cell has been revealed.
 * @property {number} clue - How many of the 8 neighbouring cells contain
 *     mines. Only meaningful when the cell is revealed and not a mine.
 */

/**
 * A Grid is a 2D array of cells, indexed by [row][col].
 * @memberof Minesweeper
 * @typedef {Minesweeper.Cell[][]} Grid
 */

/**
 * A Game represents the full state of a Minesweeper game.
 * @memberof Minesweeper
 * @typedef {Object} Game
 * @property {Minesweeper.Grid} grid - The 2D grid of cells.
 * @property {number} rows - Number of rows in the grid.
 * @property {number} cols - Number of columns in the grid.
 * @property {number} total_mines - Total number of mines in the grid.
 * @property {("in_play" | "won" | "lost")} status - Current game status.
 */

// ---------------------------------------------------------------------------
// Cell & Grid construction
// ---------------------------------------------------------------------------

/**
 * Creates a new cell in its default state:
 * unrevealed, unflagged, and mine-free.
 * @memberof Minesweeper
 * @function
 * @param {boolean} [mine=false] - Whether this cell contains a mine.
 * @returns {Minesweeper.Cell} A new cell object.
 */
Minesweeper.make_cell = (mine = false) => ({
    mine,
    flagged: false,
    revealed: false,
    clue: 0
});

/**
 * Creates a rows×cols grid of empty, unrevealed cells.
 * Uses R.map over R.range to construct the 2D array functionally.
 * @memberof Minesweeper
 * @function
 * @param {number} rows - Number of rows.
 * @param {number} cols - Number of columns.
 * @returns {Minesweeper.Grid} A new empty grid.
 */
Minesweeper.make_grid = (rows, cols) =>
    R.map(
        () => R.map(() => Minesweeper.make_cell(), R.range(0, cols)),
        R.range(0, rows)
    );

/**
 * Creates a new game in its initial state, before any moves have been made.
 * Mines are not placed until the first reveal, to guarantee a safe first move.
 * @memberof Minesweeper
 * @function
 * @param {number} [rows=9] - Number of rows in the grid.
 * @param {number} [cols=9] - Number of columns in the grid.
 * @param {number} [total_mines=10] - Number of mines to place.
 * @returns {Minesweeper.Game} A new game object ready to play.
 */
Minesweeper.make_game = (rows = 9, cols = 9, total_mines = 10) => ({
    grid: Minesweeper.make_grid(rows, cols),
    rows,
    cols,
    total_mines,
    status: "in_play"
});

// ---------------------------------------------------------------------------
// Neighbours
// ---------------------------------------------------------------------------

/**
 * Returns the coordinates of all valid neighbours of a given cell.
 * A neighbour is any of the up to 8 cells adjacent horizontally,
 * vertically, or diagonally. Cells outside the grid boundaries are excluded.
 * Uses R.pipe to compose the offset mapping and boundary filtering steps.
 * @memberof Minesweeper
 * @function
 * @param {number} row - Row index of the target cell.
 * @param {number} col - Column index of the target cell.
 * @param {number} rows - Total rows in the grid.
 * @param {number} cols - Total columns in the grid.
 * @returns {Array<[number, number]>} Array of valid [row, col]
 *     coordinate pairs.
 */
Minesweeper.get_neighbours = (row, col, rows, cols) => R.pipe(
    R.map(([dr, dc]) => [row + dr, col + dc]),
    R.filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols)
)([ [-1,-1], [-1,0], [-1,1],
    [0, -1],          [0, 1],
    [1, -1],  [1, 0], [1, 1] ]);

// ---------------------------------------------------------------------------
// Mine placement & clue computation
// ---------------------------------------------------------------------------

/**
 * Places mines randomly across the grid, guaranteeing the first-clicked
 * cell and all its neighbours are mine-free (safe first move guarantee).
 * Uses R.pipe to compose the candidate filtering, shuffling, and selection.
 * Uses R.reduce to implement a Fisher-Yates shuffle immutably.
 * @memberof Minesweeper
 * @function
 * @param {number} safe_row - Row of the first revealed cell.
 * @param {number} safe_col - Column of the first revealed cell.
 * @param {number} rows - Total rows in the grid.
 * @param {number} cols - Total columns in the grid.
 * @param {number} total_mines - Number of mines to place.
 * @returns {Minesweeper.Grid} A new grid with mines placed.
 */
Minesweeper.place_mines = (safe_row, safe_col, rows, cols, total_mines) => {
    const safe_indices = new Set(
        R.map(
            ([r, c]) => r * cols + c,
            [[safe_row, safe_col],
             ...Minesweeper.get_neighbours(safe_row, safe_col, rows, cols)]
        )
    );

    // Fisher-Yates shuffle implemented as a pure R.reduce
    const shuffle = (arr) => R.reduce(
        (acc, i) => {
            const j = i + Math.floor(Math.random() * (acc.length - i));
            const swapped = R.update(i, acc[j], R.update(j, acc[i], acc));
            return swapped;
        },
        arr,
        R.range(0, arr.length)
    );

    const mine_indices = R.pipe(
        R.range(0),
        R.filter((i) => !safe_indices.has(i)),
        shuffle,
        R.take(total_mines),
        (arr) => new Set(arr)
    )(rows * cols);

    return R.map(
        (r) => R.map(
            (c) => Minesweeper.make_cell(mine_indices.has(r * cols + c)),
            R.range(0, cols)
        ),
        R.range(0, rows)
    );
};

/**
 * Computes the clue number for every non-mine cell in the grid.
 * The clue is the count of neighbouring cells that contain mines.
 * Uses native map (with index) over the grid rows and columns,
 * and R.pipe with R.filter and R.length to count mine neighbours.
 * @memberof Minesweeper
 * @function
 * @param {Minesweeper.Grid} grid - The grid to compute clues for.
 * @param {number} rows - Total rows in the grid.
 * @param {number} cols - Total columns in the grid.
 * @returns {Minesweeper.Grid} A new grid with clue values filled in.
 */
Minesweeper.compute_clues = (grid, rows, cols) =>
    grid.map((row_cells, r) =>
        row_cells.map((cell, c) => {
            if (cell.mine) {
                return cell;
            }
            const clue = R.pipe(
                R.filter(([nr, nc]) => grid[nr][nc].mine),
                R.length
            )(Minesweeper.get_neighbours(r, c, rows, cols));
            return { ...cell, clue };
        })
    );

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

/**
 * Returns true if all non-mine cells have been revealed.
 * Uses R.all over a flattened grid (R.unnest) to check every cell.
 * @memberof Minesweeper
 * @function
 * @param {Minesweeper.Game} game - The game to check.
 * @returns {boolean} Whether the game has been won.
 */
Minesweeper.check_win = (game) =>
    R.all(
        (cell) => cell.mine || cell.revealed,
        R.unnest(game.grid)
    );

// ---------------------------------------------------------------------------
// Game operations — all pure functions returning new game state
// ---------------------------------------------------------------------------

/**
 * Reveals a cell. Handles all reveal logic:
 *  - If the game is already over, returns the game unchanged.
 *  - If the cell is already revealed or flagged, returns the game unchanged.
 *  - On the first reveal, places mines (safe-move guarantee) and
 *      computes clues.
 *  - If the revealed cell is a mine, the game is lost.
 *  - If the cell has no mine neighbours (clue = 0), triggers a cascade reveal
 *    of all connected zero-clue cells via recursion.
 *  - Otherwise reveals only the target cell.
 * @memberof Minesweeper
 * @function
 * @param {number} row - Row of the cell to reveal.
 * @param {number} col - Column of the cell to reveal.
 * @param {Minesweeper.Game} game - The current game state.
 * @returns {Minesweeper.Game} The new game state after the reveal.
 */
Minesweeper.reveal = (row, col, game) => {
    if (game.status !== "in_play") {
        return game;
    }

    const cell = game.grid[row][col];

    if (cell.revealed || cell.flagged) {
        return game;
    }

    // Detect first reveal: no cells have been revealed yet
    const is_first_reveal = R.all(
        (c) => !c.revealed,
        R.unnest(game.grid)
    );

    const grid_with_mines = is_first_reveal
        ? Minesweeper.compute_clues(
            Minesweeper.place_mines(
                row, col, game.rows, game.cols, game.total_mines
            ),
            game.rows,
            game.cols
          )
        : game.grid;

    // Mine hit — mark it revealed and set status to lost
    if (grid_with_mines[row][col].mine) {
        const lost_grid = grid_with_mines.map(
            (row_cells, ri) => row_cells.map(
                (c, ci) => (ri === row && ci === col)
                    ? { ...c, revealed: true }
                    : c
            )
        );
        return { ...game, grid: lost_grid, status: "lost" };
    }

    // Cascade reveal via recursive BFS over connected zero-clue cells
    const reveal_cells = (grid, queue, visited = new Set()) => {
        if (queue.length === 0) {
            return grid;
        }

        const [[r, c], ...rest] = queue;
        const key = r * game.cols + c;

        if (visited.has(key) || grid[r][c].revealed || grid[r][c].flagged) {
            return reveal_cells(grid, rest, visited);
        }

        const updated_grid = grid.map(
            (row_cells, ri) => row_cells.map(
                (current_cell, ci) => (ri === r && ci === c)
                    ? { ...current_cell, revealed: true }
                    : current_cell
            )
        );

        const new_visited = new Set([...visited, key]);

        const next_queue = grid[r][c].clue === 0
            ? R.pipe(
                R.filter(
                    ([nr, nc]) => !updated_grid[nr][nc].revealed
                               && !updated_grid[nr][nc].flagged
                               && !new_visited.has(nr * game.cols + nc)
                ),
                (filtered) => [...rest, ...filtered]
              )(Minesweeper.get_neighbours(r, c, game.rows, game.cols))
            : rest;

        return reveal_cells(updated_grid, next_queue, new_visited);
    };

    const new_grid = reveal_cells(grid_with_mines, [[row, col]]);
    const new_status = Minesweeper.check_win({ ...game, grid: new_grid })
        ? "won"
        : "in_play";

    return { ...game, grid: new_grid, status: new_status };
};

/**
 * Toggles the flagged state of an unrevealed cell.
 * Flagging helps the player mark cells they believe contain mines.
 * Revealed cells cannot be flagged.
 * If the game is already over, returns the game unchanged.
 * @memberof Minesweeper
 * @function
 * @param {number} row - Row of the cell to flag or unflag.
 * @param {number} col - Column of the cell to flag or unflag.
 * @param {Minesweeper.Game} game - The current game state.
 * @returns {Minesweeper.Game} The new game state with the flag toggled.
 */
Minesweeper.flag = (row, col, game) => {
    if (game.status !== "in_play") {
        return game;
    }

    const cell = game.grid[row][col];

    if (cell.revealed) {
        return game;
    }

    const new_grid = game.grid.map(
        (row_cells, ri) => row_cells.map(
            (c, ci) => (ri === row && ci === col)
                ? { ...c, flagged: !c.flagged }
                : c
        )
    );

    return { ...game, grid: new_grid };
};

/**
 * Chords a revealed numbered cell.
 * If the number of flagged neighbours exactly matches the cell's clue,
 * all remaining unflagged neighbours are revealed automatically.
 * This can trigger cascades or a loss if flags are misplaced.
 * Returns the game unchanged if the flag count does not match the clue,
 * or if the cell is not revealed, or if the game is already over.
 * Uses R.pipe with R.filter and R.length to count flagged neighbours,
 * and R.reduce to chain the individual reveal operations.
 * @memberof Minesweeper
 * @function
 * @param {number} row - Row of the cell to chord.
 * @param {number} col - Column of the cell to chord.
 * @param {Minesweeper.Game} game - The current game state.
 * @returns {Minesweeper.Game} The new game state after chording.
 */
Minesweeper.chord = (row, col, game) => {
    if (game.status !== "in_play") {
        return game;
    }

    const cell = game.grid[row][col];

    if (!cell.revealed || cell.clue === 0) {
        return game;
    }

    const neighbours = Minesweeper.get_neighbours(
        row, col, game.rows, game.cols
    );

    const flagged_count = R.pipe(
        R.filter(([nr, nc]) => game.grid[nr][nc].flagged),
        R.length
    )(neighbours);

    if (flagged_count !== cell.clue) {
        return game;
    }

    const to_reveal = R.filter(
        ([nr, nc]) => !game.grid[nr][nc].revealed
                   && !game.grid[nr][nc].flagged,
        neighbours
    );

    // Chain reveals via R.reduce — each reveal feeds into the next state
    return R.reduce(
        (state, [nr, nc]) => Minesweeper.reveal(nr, nc, state),
        game,
        to_reveal
    );
};

export default Object.freeze(Minesweeper);