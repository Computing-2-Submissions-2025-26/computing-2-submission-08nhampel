/*jslint browser*/
import Minesweeper from "./minesweeper.js";

// Expose module to browser console for debugging and manual testing.
window.Minesweeper = Minesweeper;

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

// game_state holds the current Minesweeper game object returned by the module.
let game_state;

// current_config stores the chosen difficulty settings for the current game.
let current_config = {tot_rows: 9, tot_cols: 9, mines: 10};

// Timer state — tracks the interval ID, elapsed seconds, and whether started.
let timer_id = null;
let elapsed = 0;
let timer_started = false;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

// These elements are referenced throughout the UI update functions.
const board_el = document.getElementById("board");
const mine_count_el = document.getElementById("mine-count");
const timer_el = document.getElementById("timer");
const status_el = document.getElementById("game-status");

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

// Starts the game timer on player action. Does nothing if already running.
const start_timer = function () {
    if (timer_started) {
        return;
    }
    timer_started = true;
    timer_id = setInterval(function () {
        elapsed += 1;
        timer_el.textContent = elapsed;
    }, 1000);
};

// Stops the timer — called when the game ends.
const stop_timer = function () {
    clearInterval(timer_id);
    timer_id = null;
};

// Resets the timer back to zero — called at the start of each new game.
const reset_timer = function () {
    stop_timer();
    elapsed = 0;
    timer_started = false;
    timer_el.textContent = "0";
};

// ---------------------------------------------------------------------------
// Mine counter
// ---------------------------------------------------------------------------

// Returns the number of flags the player has placed on the board.
const count_flags = function (game) {
    return game.grid.reduce(function (total, row) {
        return total + row.filter(function (cell) {
            return cell.flagged;
        }).length;
    }, 0);
};

// Updates the mine counter display — shows mines remaining (total minus flags).
const update_mine_counter = function (game) {
    mine_count_el.textContent = game.total_mines - count_flags(game);
};

// ---------------------------------------------------------------------------
// Board rendering
// ---------------------------------------------------------------------------

// Returns the text label to display inside a cell based on its state.
// Flagged cells show a flag symbol; revealed mines show a bomb; clues show
// their number; unrevealed empty cells show nothing.
const cell_label = function (cell, game_over) {
    if (cell.flagged && !cell.revealed) {
        if (game_over && !cell.mine) {
            return "✕"; // Wrong flag — mine was not here
        }
        return "⚑"; // Correct flag placement
    }
    if (!cell.revealed) {
        return ""; // Hidden cell — nothing to show
    }
    if (cell.mine) {
        return "💣"; // Revealed mine
    }
    if (cell.clue > 0) {
        return String(cell.clue); // Number of neighbouring mines
    }
    return ""; // Empty revealed cell
};

// Returns the list of CSS classes to apply to a cell based on its state.
const cell_classes = function (cell, is_hit, game_over) {
    const classes = ["cell"];
    if (cell.revealed) {
        classes.push("revealed");
    }
    if (cell.flagged && !cell.revealed) {
        classes.push("flagged");
    }
    if (is_hit) {
        classes.push("mine-hit"); // The specific mine the player clicked
    }
    if (game_over && cell.mine && !cell.flagged && !is_hit) {
        classes.push("mine-shown"); // Other mines revealed at game end
    }
    if (game_over && cell.flagged && !cell.mine) {
        classes.push("wrong-flag"); // Flag placed on a safe cell
    }
    return classes;
};

// Returns a descriptive label for cell.
// Describes the cell's position and current state.
const aria_label_for = function (cell, r, c, game_over) {
    const pos = "Row " + (r + 1) + ", column " + (c + 1);
    if (!cell.revealed && !game_over) {
        return (
            cell.flagged
            ? pos + ", flagged"
            : pos + ", unrevealed"
        );
    }
    if (cell.mine) {
        return pos + ", mine";
    }
    if (cell.clue > 0) {
        return (
            pos + ", " + cell.clue + " neighbouring mine" +
            (
                cell.clue > 1
                ? "s"
                : ""
            )
        );
    }
    return pos + ", empty";
};

// Computes the correct cell size in pixels so the board always fits the
// available screen space. Called on render and on window resize.
// Uses viewport width and measured UI heights to determine the largest
// cell size that fits both horizontally and vertically.
const update_cell_size = function () {
    const tot_cols = game_state.tot_cols;
    const tot_rows = game_state.tot_rows;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const ui_height = (
        document.querySelector(".header").offsetHeight +
        document.querySelector(".controls").offsetHeight +
        document.querySelector(".status-bar").offsetHeight +
        document.querySelector(".instructions").offsetHeight +
        80 /* gaps and padding */
    );
    const available_w = vw - 32;
    const available_h = vh - ui_height;
    const cell_w = Math.floor(available_w / tot_cols);
    const cell_h = Math.floor(available_h / tot_rows);
    const cell_size = Math.min(cell_w, cell_h, 48);
    document.documentElement.style.setProperty(
        "--cell-size",
        cell_size + "px"
    );
};

// Creates and returns a single cell button element with all its attributes,
// event listeners and styling applied. Reduces nesting in
// render_board and to keep each cell's construction self-contained.
const make_cell_el = function (cell, ri, ci, hit_key, game_over) {
    const el = document.createElement("button");
    const is_hit = ((ri + "-" + ci) === hit_key);
    const classes = cell_classes(cell, is_hit, game_over);
    el.className = classes.join(" ");
    el.textContent = cell_label(cell, game_over);
    el.setAttribute("role", "gridcell");
    el.setAttribute(
        "aria-label",
        aria_label_for(cell, ri, ci, game_over)
    );
    if (cell.revealed || game_over) {
        el.setAttribute("tabindex", "-1"); // Remove when inactive
    }
    if (cell.clue > 0 && cell.revealed) {
        el.setAttribute("data-clue", cell.clue); // Used by CSS for clue colours
    }
    el.addEventListener("click", function () {
        handle_click(ri, ci);
    });
    el.addEventListener("contextmenu", function (e) {
        e.preventDefault(); // Suppress the browser right-click menu
        handle_right_click(ri, ci);
    });
    return el;
};

// Redraws the entire board from the current game_state.
// Also updates the status display, mine counter and cell size.
// Called after every player action.
const render_board = function () {
    const grid = game_state.grid;
    const tot_cols = game_state.tot_cols;
    const status = game_state.status;
    const game_over = status !== "in_play";
    let hit_key = null;

    // Set the CSS grid columns to match the current board width.
    board_el.style.gridTemplateColumns = (
        "repeat(" + tot_cols + ", var(--cell-size))"
    );

    // Find the mine the player clicked (if the game is lost) so it can
    // be highlighted differently from the other revealed mines.
    if (status === "lost") {
        grid.some(function (row_cells, ri) {
            return row_cells.some(function (cell, ci) {
                if (cell.mine && cell.revealed) {
                    hit_key = ri + "-" + ci;
                    return true;
                }
                return false;
            });
        });
    }

    board_el.innerHTML = "";

    // Build the grid — each row is wrapped in a div with role="row" for
    // correct accessibility tree structure. display:contents makes the
    // wrapper invisible to CSS grid layout so cells sit directly in the
    // grid, giving the correct 2D layout.
    grid.forEach(function (row_cells, ri) {
        const row_el = document.createElement("div");
        row_el.setAttribute("role", "row");
        row_el.setAttribute("aria-label", "Row " + (ri + 1));
        row_el.style.display = "contents"; // Invisible - cells flow in directly
        row_cells.forEach(function (cell, ci) {
            row_el.appendChild(
                make_cell_el(cell, ri, ci, hit_key, game_over)
            );
        });
        board_el.appendChild(row_el);
    });

    board_el.classList.toggle("won", status === "won");
    update_status_display();
    update_mine_counter(game_state);
    update_cell_size();
};

// ---------------------------------------------------------------------------
// Difficulty picker
// ---------------------------------------------------------------------------

// Shows the difficulty picker overlay. Used both after the intro sequence
// and when the player starts a new game after losing or winning.
const show_difficulty_picker = function () {
    const diff_picker = document.getElementById("intro-difficulty");
    const intro_el = document.getElementById("intro");

    // Re-show the intro overlay (without the intro animation elements).
    intro_el.classList.remove("hidden");
    intro_el.style.display = "flex";

    document.getElementById("intro-text").style.display = "none";
    document.getElementById("intro-start").style.display = "none";
    document.getElementById("intro-bombs").style.display = "none";

    diff_picker.style.transition = "opacity 0.5s ease-out";
    diff_picker.style.opacity = "1";
    diff_picker.style.pointerEvents = "auto";
    diff_picker.style.display = "flex";
};

// ---------------------------------------------------------------------------
// Status & overlays
// ---------------------------------------------------------------------------

// Formats elapsed seconds as m:ss — e.g. 75 seconds becomes "1:15".
const format_time = function (seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ":" + String(secs).padStart(2, "0");
};

// Shows the YOU WIN overlay with the player's time and action buttons.
// Animates in three stages: text slams in, time rises, then buttons appear.
const show_win_overlay = function () {
    const existing = document.getElementById("win-overlay");
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "win-overlay";
    overlay.innerHTML = (
        "<div class=\"win-content\">" +
        "<div class=\"win-text\" id=\"win-text\">YOU WIN!</div>" +
        "<div class=\"win-time\" id=\"win-time\">⏱ " +
        format_time(elapsed) + "</div>" +
        "<div class=\"win-bottom\" id=\"win-bottom\">" +
        "<div class=\"boom-btns\">" +
        "<button class=\"boom-btn\" id=\"win-see-map\">See map</button>" +
        "<button class=\"boom-btn boom-btn-primary\" id=\"win-new-game\">" +
        "New game</button>" +
        "</div></div></div>"
    );
    document.body.appendChild(overlay);

    setTimeout(function () {
        const text = document.getElementById("win-text");
        if (text) {
            text.classList.add("win-text-show");
        }
    }, 300);

    setTimeout(function () {
        const time = document.getElementById("win-time");
        if (time) {
            time.classList.add("win-time-show");
        }
    }, 700);

    setTimeout(function () {
        const bottom = document.getElementById("win-bottom");
        if (bottom) {
            bottom.classList.add("win-bottom-show");
        }
    }, 1000);

    // See map — dismiss overlay and show the revealed board.
    document.getElementById("win-see-map").addEventListener(
        "click",
        function () {
            overlay.classList.add("fade-out");
            setTimeout(function () {
                const admit_btn = document.getElementById(
                    "admit-defeat-btn"
                );
                overlay.remove();
                admit_btn.textContent = "New Game";
                admit_btn.classList.add("new-game-mode");
            }, 400);
        }
    );

    // New game — dismiss overlay and show difficulty picker.
    document.getElementById("win-new-game").addEventListener(
        "click",
        function () {
            overlay.classList.add("fade-out");
            setTimeout(function () {
                overlay.remove();
                show_difficulty_picker();
            }, 400);
        }
    );
};

// Shows the BOOM overlay on loss with the mine explosion animation,
// subtitle, and action buttons. Same structure as the win overlay.
const show_boom_overlay = function () {
    const existing = document.getElementById("boom-overlay");
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "boom-overlay";
    overlay.innerHTML = (
        "<div class=\"boom-content\">" +
        "<div class=\"boom-flash\">💥</div>" +
        "<div class=\"boom-text\" id=\"boom-text\">BOOM!</div>" +
        "<div class=\"boom-bottom\" id=\"boom-bottom\">" +
        "<p class=\"boom-sub\">Better luck next time</p>" +
        "<div class=\"boom-btns\">" +
        "<button class=\"boom-btn\" id=\"boom-see-map\">See map</button>" +
        "<button class=\"boom-btn boom-btn-primary\" id=\"boom-new-game\">" +
        "New game</button>" +
        "</div></div></div>"
    );
    document.body.appendChild(overlay);

    setTimeout(function () {
        const text = document.getElementById("boom-text");
        if (text) {
            text.classList.add("boom-text-show");
        }
    }, 700);

    setTimeout(function () {
        const bottom = document.getElementById("boom-bottom");
        if (bottom) {
            bottom.classList.add("boom-bottom-show");
        }
    }, 1400);

    document.getElementById("boom-see-map").addEventListener(
        "click",
        function () {
            overlay.classList.add("fade-out");
            setTimeout(function () {
                const admit_btn = document.getElementById(
                    "admit-defeat-btn"
                );
                overlay.remove();
                admit_btn.textContent = "New Game";
                admit_btn.classList.add("new-game-mode");
            }, 400);
        }
    );

    document.getElementById("boom-new-game").addEventListener(
        "click",
        function () {
            overlay.classList.add("fade-out");
            setTimeout(function () {
                overlay.remove();
                show_difficulty_picker();
            }, 400);
        }
    );
};

// Updates the game status message displayed between the mine counter and timer.
// Also triggers the appropriate overlay when the game ends.
const update_status_display = function () {
    const status = game_state.status;
    status_el.className = "game-status";
    if (status === "won") {
        status_el.textContent = "You win!";
        status_el.classList.add("won");
        show_win_overlay();
    } else if (status === "lost") {
        status_el.textContent = "💣 Boom!";
        status_el.classList.add("lost");
        show_boom_overlay();
    } else {
        status_el.textContent = "";
    }
};

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// Handles a left click on a cell. If the cell is already revealed and has
// a clue, attempts a chord. Otherwise reveals the cell.
const handle_click = function (row, col) {
    const cell = game_state.grid[row][col];
    if (game_state.status !== "in_play") {
        return;
    }
    start_timer();
    if (cell.revealed && cell.clue > 0) {
        game_state = Minesweeper.chord(row, col, game_state);
    } else {
        game_state = Minesweeper.reveal(row, col, game_state);
    }
    if (game_state.status !== "in_play") {
        stop_timer();
    }
    render_board();
};

// Handles a right click on a cell — toggles a flag on the cell.
const handle_right_click = function (row, col) {
    if (game_state.status !== "in_play") {
        return;
    }
    start_timer();
    game_state = Minesweeper.flag(row, col, game_state);
    render_board();
};

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

// Resets the timer and creates a fresh game using the current difficulty
// config.
const start_new_game = function () {
    const admit_btn = document.getElementById("admit-defeat-btn");
    reset_timer();
    game_state = Minesweeper.make_game(
        current_config.tot_rows,
        current_config.tot_cols,
        current_config.mines
    );
    admit_btn.textContent = "Admit Defeat";
    admit_btn.classList.remove("new-game-mode");
    render_board();
};

// ---------------------------------------------------------------------------
// Admit defeat button
// ---------------------------------------------------------------------------

// The admit defeat button doubles as a "New Game" button after a game ends.
// In defeat mode: forces a loss by setting status to lost. If no cell has
// been revealed yet, reveals a random cell first so mines are placed.
document.getElementById("admit-defeat-btn").addEventListener(
    "click",
    function () {
        const btn = document.getElementById("admit-defeat-btn");
        if (btn.classList.contains("new-game-mode")) {
            btn.textContent = "Admit Defeat";
            btn.classList.remove("new-game-mode");
            show_difficulty_picker();
            return;
        }
        stop_timer();
        const is_first_reveal = game_state.grid.every(function (row) {
            return row.every(function (cell) {
                return !cell.revealed;
            });
        });
        if (is_first_reveal) {
            // Trigger mine placement by making a reveal before forcing loss.
            const random_row = Math.floor(
                Math.random() * game_state.tot_rows
            );
            const random_col = Math.floor(
                Math.random() * game_state.tot_cols
            );
            game_state = Minesweeper.reveal(
                random_row,
                random_col,
                game_state
            );
        }
        game_state = Object.assign({}, game_state, {status: "lost"});
        render_board();
        show_boom_overlay();
    }
);

// ---------------------------------------------------------------------------
// Instructions panel
// ---------------------------------------------------------------------------

// Opens the instructions panel when the "How to play" button is clicked.
document.getElementById("instructions-btn").addEventListener(
    "click",
    function () {
        document.getElementById("instructions-panel").removeAttribute(
            "hidden"
        );
    }
);

// Closes the instructions panel via the ✕ button.
document.getElementById("instructions-close").addEventListener(
    "click",
    function () {
        document.getElementById("instructions-panel").setAttribute(
            "hidden",
            ""
        );
    }
);

// Closes the instructions panel when the player presses Escape.
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        const panel = document.getElementById("instructions-panel");
        if (!panel.hasAttribute("hidden")) {
            panel.setAttribute("hidden", "");
        }
    }
});

// ---------------------------------------------------------------------------
// Keyboard navigation — arrow keys, Enter/Space to reveal, F to flag
// ---------------------------------------------------------------------------

board_el.addEventListener("keydown", function (event) {
    const focused = document.activeElement;
    const cells = Array.from(board_el.querySelectorAll(".cell"));
    const index = cells.indexOf(focused);
    const tot_cols = game_state.tot_cols;
    const total = cells.length;

    if (!focused || !focused.classList.contains("cell")) {
        return;
    }
    if (event.key === "Enter" || event.key === " ") {
        focused.click(); // Trigger the cell's click handler
    }
    if (event.key === "f" || event.key === "F") {
        const row = Math.floor(index / tot_cols);
        const col = index % tot_cols;
        game_state = Minesweeper.flag(row, col, game_state);
        render_board();
        cells[index].focus(); // Restore focus after re-render
    }
    if (event.key === "ArrowLeft" && index > 0) {
        cells[index - 1].focus();
    }
    if (event.key === "ArrowRight" && index < total - 1) {
        cells[index + 1].focus();
    }
    if (event.key === "ArrowUp" && index - tot_cols >= 0) {
        cells[index - tot_cols].focus();
    }
    if (event.key === "ArrowDown" && index + tot_cols < total) {
        cells[index + tot_cols].focus();
    }
});

// ---------------------------------------------------------------------------
// Window resize — recalculate cell size when viewport changes
// ---------------------------------------------------------------------------

window.addEventListener("resize", update_cell_size);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Start a default beginner game immediately so the board is visible
// behind the intro overlay.
start_new_game();

// ---------------------------------------------------------------------------
// Intro sequence — runs only on first page load
// ---------------------------------------------------------------------------

// run_intro animates the welcome screen and difficulty picker.
// It runs after a short delay to allow the board to render first.
const run_intro = function () {
    const intro_el = document.getElementById("intro");
    const bombs_el = document.getElementById("intro-bombs");
    const start_btn = document.getElementById("intro-start");
    const request_animation_frame = window.requestAnimationFrame;
    let bomb_count = 0;
    const max_bombs = 60; // Total bombs to animate before showing start button

    const bomb_interval = setInterval(function () {
        if (bomb_count >= max_bombs) {
            clearInterval(bomb_interval);
            setTimeout(function () {
                // Fade out the title and bombs, then reveal the start button.
                bombs_el.style.transition = "opacity 0.8s ease-out";
                bombs_el.style.opacity = "0";
                const intro_text = document.getElementById("intro-text");
                intro_text.style.transition = "opacity 0.8s ease-out";
                intro_text.style.opacity = "0";
                setTimeout(function () {
                    intro_text.style.display = "none";
                    start_btn.style.transition = (
                        "opacity 0.5s, transform 0.5s"
                    );
                    start_btn.style.opacity = "1";
                    start_btn.style.pointerEvents = "auto";
                    start_btn.style.transform = "translateY(0)";
                }, 800);
            }, 300);
            return;
        }

        // Spawn a falling bomb with random position, size, and speed.
        const bomb = document.createElement("span");
        const duration = 1500 + Math.random() * 1500;
        let start_time = null;

        bomb.className = "intro-falling-bomb";
        bomb.textContent = "💣";
        bomb.style.left = (Math.random() * 96) + "vw";
        bomb.style.fontSize = (4 + Math.random() * 4) + "rem";
        bomb.style.top = "0px";

        bombs_el.appendChild(bomb);

        // Animate the bomb falling using requestAnimationFrame.
        const animate = function (now) {
            if (start_time === null) {
                start_time = now;
            }
            const progress = Math.min(
                (now - start_time) / duration,
                1
            );
            const eased = progress * progress; // accelerates as it falls
            const y = -150 + (window.innerHeight + 300) * eased;
            const rotation = progress * 360;
            bomb.style.transform = (
                "translateY(" + y + "px) rotate(" + rotation + "deg)"
            );
            if (progress < 1) {
                request_animation_frame(animate);
            }
        };

        request_animation_frame(animate);
        bomb_count += 1;
    }, 80); // Spawn a new bomb every 80ms

    // When the player clicks Start Game, fade it out and show the
    // difficulty picker.
    start_btn.addEventListener("click", function () {
        start_btn.style.transition = "opacity 0.3s ease-out";
        start_btn.style.opacity = "0";
        start_btn.style.pointerEvents = "none";
        setTimeout(function () {
            const diff_picker = document.getElementById(
                "intro-difficulty"
            );
            start_btn.style.display = "none";
            diff_picker.style.transition = "opacity 0.5s ease-out";
            diff_picker.style.opacity = "1";
            diff_picker.style.pointerEvents = "auto";
            diff_picker.style.display = "flex";
        }, 300);
    });

    // Each difficulty button sets the config and starts the game.
    document.querySelectorAll(".intro-diff-btn").forEach(
        function (btn) {
            btn.addEventListener("click", function () {
                const diff_picker = document.getElementById(
                    "intro-difficulty"
                );
                current_config = {
                    tot_rows: Number(btn.dataset.rows),
                    tot_cols: Number(btn.dataset.cols),
                    mines: Number(btn.dataset.mines)
                };
                start_new_game();
                intro_el.classList.add("hidden");
                intro_el.style.display = "none";
                diff_picker.style.display = "none";
                diff_picker.style.opacity = "0";
                diff_picker.style.pointerEvents = "none";
            });
        }
    );
};

// Delay the intro sequence slightly so the board renders first.
setTimeout(run_intro, 2100);