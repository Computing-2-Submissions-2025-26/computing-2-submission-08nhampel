# Computing 2 Coursework Submission.
**CID**: [02388263]

## AI Disclosure
Claude (Anthropic) was used as a coding assistant during this project.
Specifically it was used to help neaten and format code to meet jslint
requirements, and to assist with the implementation of tests —
particularly the property-based tests using fast-check, where it helped
design the arbitraries and properties. All game logic, architecture,
and design decisions are my own.

## Game
Minesweeper — a single-player logic game where the player reveals
cells on a grid, using numbered clues to deduce where mines are
hidden. The goal is to reveal every safe cell without detonating
a mine.


## Running the game
1. Install dependencies: `npm install`
2. Open `web-app/index.html` with VS Code Live Server

## Running the tests
A set of unit tests were written for the behaviour of the game. Extra property based testing was to further test general rules that must hold ANY valid input.
Use : `npm test`
The test set is not exhaustive, but tests the game-end conditions.

## Generating the API docs
Open `docs/index.html` in your browser to view the API documentation.

