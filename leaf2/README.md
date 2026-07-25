# Leaf² — Second Ecology

Leaf² is an isolated experimental edition at `https://amuletmaiden.github.io/leaf2/`.

## Safety boundary

- It does not modify `amuletmaiden/leaf`.
- It fetches the raw Leaf engine into an iframe `srcdoc`.
- The normal named systems are loaded explicitly from `/leaf/`.
- `leaf-new-goddesses.js` is replaced only inside Leaf² by `leaf2-new-goddesses.js`.
- All `localStorage` and IndexedDB names are prefixed with `leaf2::`, so the experimental world cannot overwrite the main Leaf world.
- Deleting the `leaf2/` directory completely reverts the experiment.

## Files

- `index.html` — isolated loader, controls, metrics, and codex aperture.
- `leaf2.js` — stellar ecology, law architecture, sight, mind skirts, gyre-silk profiler.
- `leaf2-new-goddesses.js` — more legible Retrograde Hunger and Scavenger’s Hem.
- `codex.html` — Katherine’s Alphabet 101 plus clearly subordinate Kara research notes.

## Measured systems

The in-page instrument reports actual rolling costs for:

- stellar physics
- stellar rendering
- gyre updates
- gyre-silk layer construction
- gyre-silk compositing
- Temple rendering

The `gyre silk` control turns the visual layer off for direct comparison.
