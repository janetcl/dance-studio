// Plays in court units (tenths of a foot): u across the court (0–500, left to right
// facing the basket), v out from the baseline (0) to half court (470).
// Each beat lists who moves (path through points), what happens to the ball, and the
// arrows to draw: cut (solid), dribble (zigzag), pass (dashed), screen (bar).
export const PLAYS = [
  {
    id: 'backdoor-stagger-cross',
    name: 'Backdoor, stagger, cross',
    start: { 1: [250, 320], 2: [420, 230], 3: [120, 190], 4: [165, 90], 5: [330, 85] },
    ball: '1',
    beats: [
      {
        name: 'Set', dur: 1.6, who: 'everyone in place',
        text: '1 has it up top. 3 and 4 stack on the left to screen. 5 posts on the right block, 2 is on the right wing.',
        ball: { type: 'dribble', who: '1' },
      },
      {
        name: 'Backdoor cut', dur: 1.9, who: '2 cuts',
        text: '2 cuts behind their defender to the rim and keeps running the baseline to the left.',
        ball: { type: 'dribble', who: '1' },
        moves: { 2: { path: [[420, 230], [372, 150], [292, 68], [200, 42], [118, 50]] } },
        marks: [{ k: 'cut', pts: [[420, 230], [372, 150], [292, 68], [200, 42], [118, 50]] }],
      },
      {
        name: 'Up the stagger', dur: 2.4, who: '2 runs off 4 and 3 · 1 → 5',
        text: "2 comes off 4's low screen, then 3's high screen, to the top. 1 feeds 5 in the post.",
        ball: { type: 'pass', from: '1', to: '5', t0: 0.4, t1: 0.66, dribble: true },
        moves: {
          2: { path: [[118, 50], [205, 100], [178, 185], [156, 252], [180, 305]], pace: 'explode' },
          5: { path: [[330, 85], [324, 96]] },
        },
        marks: [
          { k: 'screen', at: [184, 90], ang: 80 },
          { k: 'screen', at: [140, 192], ang: 70 },
          { k: 'cut', pts: [[118, 50], [205, 100], [178, 185], [156, 252], [180, 305]] },
          { k: 'pass', a: [250, 320], b: [322, 106] },
        ],
      },
      {
        name: 'Kick out', dur: 1.6, who: '5 → 2 · 1 clears',
        text: '5 passes back out to 2 at the top. 1 clears to the right wing.',
        ball: { type: 'pass', from: '5', to: '2', t0: 0.08, t1: 0.42 },
        moves: { 1: { path: [[250, 320], [330, 306], [405, 255]] } },
        marks: [{ k: 'pass', a: [322, 100], b: [186, 296] }, { k: 'cut', pts: [[250, 320], [330, 306], [405, 255]] }],
      },
      {
        name: 'Cross cut', dur: 1.9, who: '4 cuts · 2 → 4',
        text: '4 leaves the low screen, cuts across the lane and catches from 2.',
        ball: { type: 'pass', from: '2', to: '4', t0: 0.55, t1: 0.86 },
        moves: { 4: { path: [[165, 90], [242, 132], [322, 148]], pace: 'explode' } },
        marks: [{ k: 'cut', pts: [[165, 90], [242, 132], [322, 148]] }, { k: 'pass', a: [180, 300], b: [316, 160] }],
      },
      {
        name: 'Shot', dur: 1.7, who: '4 shoots',
        text: '4 rises up for the short jumper.',
        ball: { type: 'shot', who: '4', t0: 0.15, t1: 0.62 },
      },
    ],
  },
];
