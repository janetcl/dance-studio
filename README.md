# Dance Studio

A choreography tool for planning formations on a 3D stage — the redesign of my senior thesis project ([janetcl/dance](https://github.com/janetcl/dance), kept as-is for history).

**Live:** https://janetcl.github.io/dance-studio/

## What it does

- **Storyboard of formations** — each card is one moment; reorder by dragging, set how long each is held and how long the move into the next takes.
- **Real figures, not cubes** — lit 3D dancers that walk between formations and turn to face where they're going.
- **Any number of dancers, any time** — add or remove dancers whenever; mark someone offstage in a formation for entrances and exits.
- **Counts, not seconds** — everything is in 8-counts: set the BPM (or tap it), line up count 1 with the music, optional metronome. Changing tempo keeps every hold and move the same number of counts.
- **Paths** — select a dancer and drag the dots on their path: hollow ○ adds a bend, solid ● moves it, double-click removes it.
- **Rhythm per count** — each move has a strip with one cell per count; set each count to Hold, Slow, Medium or Fast (e.g. slow 2, fast 4, slow 2). Presets for Even, Slow–fast–slow, Wait then go, and more; Ripple for canons.
- **Travel styles** — Walk, Run, Chassé, Turn, Leap, Floor, and which way dancers face while moving. The mannequins perform them.
- **Count sheets** — write what happens on each count per formation (“1-4 arm sweep”), for everyone or specific dancers. Lines show as captions during playback.
- **Collision check** — flags dancers standing on top of each other or running into each other mid-move (closer than 0.55 m), on the stage, the timeline and the formation cards. One click fixes a collision by bending a path or shifting someone's timing; “Fix all” does every one. Partners in a pair/group are allowed to touch.
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
