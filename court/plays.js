// Preloaded plays. Court units: u across (0–500), v out from the baseline (0–470).
// Shorthand per beat: m = moves (player number → points, the last one is where they
// end up), s = screeners, pc = pace, b = ball ['pass', to, t0, t1] or ['shot', t0, t1],
// dr = dribble in place.
import { newPlay, uid, validate } from './model.js';

function def({ id, name, cat, blurb, start, ball = 1, beats }) {
  const p = newPlay({ name });
  p.id = 'preset-' + id;
  p.cat = cat;
  p.blurb = blurb;
  p.ball = 'o' + ball;
  for (const [n, q] of Object.entries(start)) p.start['o' + n] = q;
  p.beats = beats.map(([bname, dur, text, o = {}]) => {
    const moves = {};
    for (const [n, pts] of Object.entries(o.m || {})) moves['o' + n] = { to: pts[pts.length - 1], wp: pts.slice(0, -1) };
    for (const n of o.s || []) moves['o' + n] = { ...(moves['o' + n] || {}), act: 'screen' };
    for (const [n, pace] of Object.entries(o.pc || {})) moves['o' + n] = { ...(moves['o' + n] || {}), pace };
    let b = null;
    if (o.b && o.b[0] === 'pass') b = { kind: 'pass', to: 'o' + o.b[1], t0: o.b[2] ?? 0.3, t1: o.b[3] ?? 0.65 };
    if (o.b && o.b[0] === 'shot') b = { kind: 'shot', t0: o.b[1] ?? 0.2, t1: o.b[2] ?? 0.65 };
    return { id: uid(), name: bname, dur, text, moves, ball: b, dribble: !!o.dr };
  });
  return validate(p);
}

export const PRESETS = [
  def({
    id: 'yesterday', name: 'Backdoor, stagger, cross', cat: 'Cuts',
    blurb: 'Backdoor cut, come up off two stacked screens, then the low screener cuts across.',
    start: { 1: [250, 320], 2: [420, 230], 3: [120, 190], 4: [165, 90], 5: [330, 85] },
    beats: [
      ['Set', 1.6, '1 has it up top. 3 and 4 stack on the left to screen. 5 posts on the right block, 2 is on the right wing.', { dr: true }],
      ['Backdoor cut', 1.9, '2 cuts behind their defender to the rim and keeps running the baseline to the left.', { m: { 2: [[372, 150], [292, 68], [200, 42], [118, 50]] }, dr: true }],
      ['Up the stagger', 2.4, "2 runs tight around the outside of 4's low screen, then 3's high screen, and curls to the top. 1 feeds 5 in the post.", { m: { 2: [[140, 106], [104, 204], [124, 266], [180, 305]], 5: [[324, 96]] }, s: [4, 3], pc: { 2: 'explode' }, b: ['pass', 5, 0.4, 0.66], dr: true }],
      ['Kick out', 1.6, '5 passes back out to 2 at the top. 1 clears to the right wing.', { m: { 1: [[330, 306], [405, 255]] }, b: ['pass', 2, 0.08, 0.42] }],
      ['Cross cut', 1.9, '4 leaves the low screen, cuts across the lane and catches from 2.', { m: { 4: [[242, 132], [322, 148]] }, pc: { 4: 'explode' }, b: ['pass', 4, 0.55, 0.86] }],
      ['Shot', 1.7, '4 rises up for the short jumper.', { b: ['shot', 0.15, 0.62] }],
    ],
  }),
  def({
    id: 'pnr', name: 'High pick and roll', cat: 'Pick and roll',
    blurb: '5 screens at the top, 1 attacks, 5 rolls for the pass.',
    start: { 1: [250, 330], 2: [45, 40], 3: [455, 40], 4: [70, 220], 5: [330, 190] },
    beats: [
      ['Set', 1.2, '1 at the top of the key. Shooters in both corners, 4 on the left wing, 5 at the right elbow.', { dr: true }],
      ['Screen', 1.4, '5 comes up and sets a ball screen on 1\'s right side.', { m: { 5: [[300, 250], [282, 300]] }, s: [5], dr: true }],
      ['Drive and roll', 1.8, '1 dribbles off the screen to the right. 5 rolls hard to the rim.', { m: { 1: [[320, 300], [372, 258]], 5: [[305, 190], [268, 92]] }, pc: { 5: 'explode' } }],
      ['Pass', 1.2, '1 hits 5 on the roll.', { b: ['pass', 5, 0.1, 0.5] }],
      ['Finish', 1.4, '5 lays it in.', { m: { 5: [[258, 72]] }, b: ['shot', 0.3, 0.7] }],
    ],
  }),
  def({
    id: 'horns', name: 'Horns: ball screen', cat: 'Pick and roll',
    blurb: 'Both bigs at the elbows. One screens and rolls, the other pops.',
    start: { 1: [250, 330], 2: [40, 40], 3: [460, 40], 4: [180, 190], 5: [320, 190] },
    beats: [
      ['Set', 1.2, 'Horns: 4 and 5 at the elbows, 2 and 3 in the corners.', { dr: true }],
      ['Screen', 1.4, '5 steps up to screen for 1.', { m: { 5: [[285, 300]] }, s: [5], dr: true }],
      ['Roll and pop', 1.8, '1 comes off the screen. 5 rolls to the rim, 4 pops to the wing.', { m: { 1: [[330, 295], [360, 270]], 5: [[300, 190], [270, 92]], 4: [[150, 250], [170, 300]] }, pc: { 5: 'explode' } }],
      ['Pass', 1.0, '1 hits 5 on the roll.', { b: ['pass', 5, 0.1, 0.55] }],
      ['Finish', 1.4, '5 finishes at the rim. 3 crashes.', { m: { 3: [[430, 120]] }, b: ['shot', 0.25, 0.7] }],
    ],
  }),
  def({
    id: 'give-go', name: 'Give and go', cat: 'Cuts',
    blurb: 'Pass to the wing, cut hard to the rim, get it right back.',
    start: { 1: [250, 320], 2: [90, 230], 3: [420, 230], 4: [60, 40], 5: [440, 40] },
    beats: [
      ['Give', 1.2, '1 passes to 2 on the left wing.', { b: ['pass', 2, 0.2, 0.6] }],
      ['Go', 1.6, '1 fakes away, then cuts to the rim.', { m: { 1: [[285, 210], [252, 86]] }, pc: { 1: 'explode' } }],
      ['Return pass', 1.1, '2 hits 1 on the cut.', { b: ['pass', 1, 0.05, 0.5] }],
      ['Layup', 1.3, '1 lays it in.', { b: ['shot', 0.2, 0.65] }],
    ],
  }),
  def({
    id: 'backdoor', name: 'Backdoor cut', cat: 'Cuts',
    blurb: 'Princeton-style: when the wing is overplayed, go behind for the bounce pass.',
    start: { 1: [250, 320], 2: [80, 230], 3: [420, 230], 4: [440, 40], 5: [330, 80] },
    beats: [
      ['Flash', 1.3, '5 flashes to the high post.', { m: { 5: [[290, 150], [250, 200]] }, dr: true }],
      ['Pass to post', 1.0, '1 passes to 5 at the free-throw line.', { b: ['pass', 5, 0.15, 0.6] }],
      ['Backdoor', 1.6, '2 is overplayed, so they cut behind their defender.', { m: { 2: [[120, 160], [225, 70]] }, pc: { 2: 'explode' } }],
      ['Bounce pass', 1.0, '5 bounces it to 2.', { b: ['pass', 2, 0.05, 0.55] }],
      ['Layup', 1.2, '2 finishes.', { b: ['shot', 0.15, 0.6] }],
    ],
  }),
  def({
    id: 'spain', name: 'Spain pick and roll', cat: 'Pick and roll',
    blurb: "A shooter back-screens the roller's defender, then pops for three.",
    start: { 1: [250, 330], 2: [90, 236], 3: [455, 40], 4: [45, 40], 5: [330, 190] },
    beats: [
      ['Set', 1.0, '1 up top, 5 at the right elbow, 2 on the left wing.', { dr: true }],
      ['Ball screen', 1.4, '5 sets a ball screen for 1.', { m: { 5: [[285, 300]] }, s: [5], dr: true }],
      ['Back screen', 1.7, "1 drives right. 5 rolls while 2 back-screens 5's defender.", { m: { 1: [[330, 296], [372, 258]], 5: [[300, 200], [268, 95]], 2: [[190, 215], [262, 226]] }, s: [2], pc: { 5: 'explode' } }],
      ['Pop', 1.2, '2 pops back out to the top for three.', { m: { 2: [[222, 285], [200, 310]] } }],
      ['Pass', 1.0, '1 swings it to 2.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Three', 1.4, '2 lets it fly.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'flex', name: 'Flex', cat: 'Screens off the ball',
    blurb: 'Baseline flex screen, then a down screen for the screener.',
    start: { 1: [90, 240], 2: [400, 240], 3: [460, 50], 4: [180, 240], 5: [330, 74] },
    beats: [
      ['Set', 1.0, '1 has it on the left wing. 5 on the right block, 3 in the right corner.', { dr: true }],
      ['Flex cut', 1.7, "3 cuts along the baseline off 5's flex screen.", { m: { 3: [[330, 110], [190, 80]] }, s: [5], pc: { 3: 'explode' } }],
      ['Down screen', 1.5, '4 comes down and screens for 5.', { m: { 4: [[185, 160], [292, 112]] }, s: [4] }],
      ['Pop to the top', 1.6, '5 pops to the top and 1 swings it over.', { m: { 5: [[310, 200], [262, 300]] }, b: ['pass', 5, 0.6, 0.92] }],
      ['Shot', 1.3, '5 shoots from the top.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'floppy', name: 'Floppy', cat: 'Screens off the ball',
    blurb: 'Shooter under the rim picks a side and comes off a screen to the wing.',
    start: { 1: [250, 320], 2: [250, 90], 3: [455, 300], 4: [160, 100], 5: [330, 100] },
    beats: [
      ['Stack', 1.0, '2 under the rim between 4 and 5.', { dr: true }],
      ['Screens set', 1.0, '4 and 5 set screens on both blocks.', { s: [4, 5], dr: true }],
      ['Shooter reads', 1.6, '2 picks the right side and comes off 5 to the wing.', { m: { 2: [[360, 100], [418, 206]] }, s: [5], pc: { 2: 'explode' }, dr: true }],
      ['Catch', 1.0, '1 hits 2 on the wing.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Shoot', 1.3, '2 catches and shoots.', { b: ['shot', 0.1, 0.65] }],
    ],
  }),
  def({
    id: 'box', name: 'Box inbound (baseline)', cat: 'Inbounds', ball: 3,
    blurb: 'Four in a box under the rim. Screen the screener, inbound to the open player.',
    start: { 1: [190, 64], 2: [310, 150], 3: [330, -22], 4: [190, 150], 5: [310, 64] },
    beats: [
      ['Box set', 1.0, '3 inbounds from the baseline. Four in a box.'],
      ['Cross screen', 1.4, '4 cross-screens for 2.', { m: { 4: [[240, 140], [292, 120]] }, s: [4] }],
      ['Cuts', 1.6, '2 flares to the corner, 5 seals to the rim.', { m: { 2: [[400, 120], [440, 50]], 5: [[285, 45], [262, 60]] }, pc: { 5: 'late' } }],
      ['Inbound', 1.0, '3 hits 5 at the rim.', { b: ['pass', 5, 0.1, 0.55] }],
      ['Layup', 1.2, '5 lays it in.', { b: ['shot', 0.15, 0.6] }],
    ],
  }),
];
