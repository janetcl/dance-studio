# Dance Studio

A choreography tool for planning formations on a 3D stage — the redesign of my senior thesis project ([janetcl/dance](https://github.com/janetcl/dance), kept as-is for history).

**Live:** https://janetcl.github.io/dance-studio/

## What it does

- **Storyboard of formations** — each card is one moment; reorder by dragging, set how long each is held and how long the move into the next takes.
- **Real figures, not cubes** — lit 3D dancers that walk between formations and turn to face where they're going.
- **Any number of dancers, any time** — add or remove dancers whenever; mark someone offstage in a formation for entrances and exits.
- **Paths** — every move is drawn from where the dancer was; reshape a dancer's path on the stage.
- **Per-dancer timing** — choose when each dancer leaves and arrives within a move, and their pace.
- **Pairs & groups** — partner dancers up so they share one color (matching or shades).
- **Shapes** — Line, Two rows, V, Circle, Diagonal, Grid, Diamond, Arc, Spiral; Mirror, Tighter, Wider.
- **Music** — add a song, see its waveform, play the dance in sync.
- **Save & share** — dances save in your browser; export/import `.json`, or copy a share link.

## Running locally

Static site, no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

three.js r170 loads from jsDelivr; its OrbitControls addon is vendored in `vendor/`.
