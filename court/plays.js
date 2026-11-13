// Preloaded plays. Court units: u across (0–500), v out from the baseline (0–470).
// Shorthand per beat: m = moves (player number → points, the last one is where they
// end up), s = screeners, pc = pace, b = ball ['pass', to, t0, t1] or ['shot', t0, t1],
// dr = dribble in place.
import { newPlay, uid, validate } from './model.js?v=20261113t';

function def({ id, name, cat, blurb, start, ball = 1, beats, size = 5, defense = 'man', zone, level }) {
  const p = newPlay({ name, size, defense });
  if (zone) p.zone = zone;
  p.id = 'preset-' + id;
  p.cat = cat;
  p.blurb = blurb;
  p.level = level || (cat === 'Easy' ? 'Beginner' : 'Intermediate');
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

const FIVE_OUT = { 1: [250, 320], 2: [80, 230], 3: [420, 230], 4: [40, 40], 5: [460, 40] };

export const PRESETS = [
  // ---------- Easy: one idea each, a few beats ----------
  def({
    id: 'drive-kick', name: 'Drive and kick', cat: 'Easy',
    blurb: 'Five out. 1 drives the gap and kicks it to the open corner for three.',
    start: FIVE_OUT,
    beats: [
      ['Spread out', 1.0, 'Everyone spaced around the arc: top, both wings, both corners.', { dr: true }],
      ['Drive', 1.6, '1 attacks the right side of the lane.', { m: { 1: [[275, 250], [300, 150]] }, pc: { 1: 'early' } }],
      ['Kick out', 1.0, '1 kicks it out to 5 in the right corner.', { b: ['pass', 5, 0.1, 0.6] }],
      ['Corner three', 1.3, '5 catches and shoots.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'pick-pop', name: 'Pick and pop', cat: 'Easy',
    blurb: '4 screens for 1, then pops out for an open jumper instead of rolling.',
    start: { 1: [250, 330], 2: [40, 40], 3: [460, 40], 4: [320, 195], 5: [170, 80] },
    beats: [
      ['Set', 1.0, '1 up top, 4 at the right elbow, 5 on the left block.', { dr: true }],
      ['Screen', 1.3, '4 comes up and screens for 1.', { m: { 4: [[285, 300]] }, s: [4], dr: true }],
      ['Drive and pop', 1.7, '1 goes left off the screen. 4 pops out to the right side.', { m: { 1: [[205, 295], [150, 245]], 4: [[330, 305], [385, 290]] } }],
      ['Pass', 1.0, '1 throws it back to 4.', { b: ['pass', 4, 0.1, 0.6] }],
      ['Jumper', 1.3, '4 shoots the open jumper.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'pass-cut', name: 'Pass and cut', cat: 'Easy',
    blurb: 'The basic motion rule: pass, cut to the rim, everyone slides over a spot.',
    start: FIVE_OUT,
    beats: [
      ['Pass', 1.0, '1 passes to 2 on the left wing.', { b: ['pass', 2, 0.15, 0.6] }],
      ['Cut', 1.5, '1 cuts straight to the rim looking for the ball.', { m: { 1: [[245, 190], [250, 80]] }, pc: { 1: 'explode' } }],
      ['Fill', 1.7, '1 clears to the right corner. 5 lifts to the wing, 3 slides to the top.', { m: { 1: [[360, 55], [460, 40]], 5: [[440, 130], [420, 230]], 3: [[340, 290], [250, 320]] } }],
      ['Swing', 1.0, '2 swings it to 3 at the top.', { b: ['pass', 3, 0.1, 0.6] }],
      ['Swing again', 1.0, '3 swings it to 5 on the right wing.', { b: ['pass', 5, 0.1, 0.6] }],
      ['Shot', 1.3, '5 shoots from the wing.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'dho', name: 'Dribble handoff', cat: 'Easy',
    blurb: '1 dribbles at 2 and hands it off. 2 comes around and attacks the rim.',
    start: FIVE_OUT,
    beats: [
      ['Set', 1.0, 'Five out. 1 has it up top.', { dr: true }],
      ['Dribble at', 1.4, '1 dribbles toward 2 on the left wing.', { m: { 1: [[190, 290], [125, 250]] } }],
      ['Handoff', 1.1, '2 runs past 1 and takes the handoff. 1 stays to screen.', { m: { 2: [[95, 260], [150, 285]] }, s: [1], b: ['pass', 2, 0.35, 0.6] }],
      ['Drive', 1.5, '2 attacks the rim.', { m: { 2: [[215, 220], [238, 105]] }, pc: { 2: 'early' } }],
      ['Layup', 1.2, '2 lays it in.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'down-screen', name: 'Down screen for a shooter', cat: 'Easy',
    blurb: '4 screens down, 2 pops out to the wing for an open catch-and-shoot.',
    start: { 1: [250, 320], 2: [170, 70], 3: [420, 230], 4: [130, 205], 5: [330, 80] },
    beats: [
      ['Set', 1.0, '2 on the left block, 4 above them on the wing.', { dr: true }],
      ['Down screen', 1.3, '4 comes down and screens for 2.', { m: { 4: [[160, 120]] }, s: [4], dr: true }],
      ['Pop out', 1.5, '2 pops out to the left wing off the screen.', { m: { 2: [[125, 120], [95, 220]] }, pc: { 2: 'explode' }, dr: true }],
      ['Pass', 1.0, '1 hits 2 on the wing.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Shot', 1.3, '2 catches and shoots.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'post-up', name: 'Post up', cat: 'Easy',
    blurb: 'Get it to the wing, feed the big on the block, back down for a hook.',
    start: { 1: [250, 320], 2: [80, 230], 3: [420, 230], 4: [40, 40], 5: [330, 85] },
    beats: [
      ['Pass to wing', 1.0, '1 passes to 3 on the right wing.', { b: ['pass', 3, 0.15, 0.6] }],
      ['Seal', 1.0, '5 seals their defender on the right block.', { m: { 5: [[322, 98]] } }],
      ['Post entry', 1.0, '3 feeds 5 in the post.', { b: ['pass', 5, 0.1, 0.55] }],
      ['Back down', 1.6, '5 dribbles back toward the rim.', { m: { 5: [[300, 80], [284, 66]] } }],
      ['Hook shot', 1.3, '5 turns and shoots a hook.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'iso', name: 'Isolation', cat: 'Easy',
    blurb: 'Everyone clears to the corners and wings so 1 can go one on one.',
    start: { 1: [250, 320], 2: [80, 230], 3: [420, 230], 4: [180, 190], 5: [320, 190] },
    beats: [
      ['Clear out', 1.5, 'The bigs clear to the corners and the wings get low. The middle is empty.', { m: { 4: [[110, 120], [40, 40]], 5: [[390, 120], [460, 40]], 2: [[60, 150]], 3: [[440, 150]] }, dr: true }],
      ['Attack', 1.7, '1 drives at their defender and gets to the rim.', { m: { 1: [[225, 235], [255, 110]] }, pc: { 1: 'late' } }],
      ['Finish', 1.2, '1 finishes.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'two-pnr', name: '2-on-2 pick and roll', cat: 'Easy', size: 2,
    blurb: 'The simplest two-player action: screen, roll, pass, layup.',
    start: { 1: [250, 320], 2: [330, 190] },
    beats: [
      ['Set', 1.0, '1 up top, 2 at the right elbow.', { dr: true }],
      ['Screen', 1.3, '2 sets a ball screen.', { m: { 2: [[285, 300]] }, s: [2], dr: true }],
      ['Roll', 1.7, '1 comes off the screen. 2 rolls to the rim.', { m: { 1: [[330, 290], [372, 255]], 2: [[300, 190], [265, 90]] }, pc: { 2: 'explode' } }],
      ['Pass', 1.0, '1 hits 2.', { b: ['pass', 2, 0.1, 0.55] }],
      ['Layup', 1.2, '2 lays it in.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'three-screen-away', name: '3-on-3 pass and screen away', cat: 'Easy', size: 3,
    blurb: 'Pass one way, screen the other way. 3 cuts off the screen to the rim.',
    start: { 1: [250, 310], 2: [80, 190], 3: [420, 190] },
    beats: [
      ['Pass', 1.0, '1 passes to 2 on the left.', { b: ['pass', 2, 0.15, 0.6] }],
      ['Screen away', 1.4, '1 goes away from the ball to screen for 3.', { m: { 1: [[330, 260], [385, 215]] }, s: [1] }],
      ['Cut', 1.6, '3 comes off the screen and cuts to the rim.', { m: { 3: [[400, 260], [330, 230], [268, 110]] }, pc: { 3: 'explode' } }],
      ['Pass', 1.0, '2 hits 3 on the cut.', { b: ['pass', 3, 0.05, 0.5] }],
      ['Layup', 1.2, '3 finishes.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'zone-gap', level: 'Intermediate', name: 'Beat the 2-3 zone', cat: 'Easy', defense: 'zone', zone: '2-3',
    blurb: 'Against a 2-3 zone: flash to the middle, then kick to the open corner.',
    start: { 1: [250, 320], 2: [90, 240], 3: [410, 240], 4: [40, 45], 5: [330, 70] },
    beats: [
      ['Set', 1.0, 'Players sit in the gaps of the zone. 5 on the right short block.', { dr: true }],
      ['Flash', 1.4, '5 flashes to the free-throw line, the soft middle of the 2-3.', { m: { 5: [[300, 130], [255, 190]] }, pc: { 5: 'explode' }, dr: true }],
      ['High post', 1.0, '1 hits 5 at the free-throw line.', { b: ['pass', 5, 0.1, 0.55] }],
      ['Kick to corner', 1.0, 'The zone collapses on 5, so 5 kicks to 4 in the left corner.', { b: ['pass', 4, 0.15, 0.65] }],
      ['Corner three', 1.3, '4 shoots.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),

  // ---------- Sets ----------
  def({
    id: 'yesterday', level: 'Intermediate', name: 'Backdoor, stagger, cross', cat: 'Cuts',
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
    id: 'pnr', level: 'Beginner', name: 'High pick and roll', cat: 'Pick and roll',
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
    id: 'horns', level: 'Intermediate', name: 'Horns: ball screen', cat: 'Pick and roll',
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
    id: 'give-go', level: 'Beginner', name: 'Give and go', cat: 'Cuts',
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
    id: 'backdoor', level: 'Beginner', name: 'Backdoor cut', cat: 'Cuts',
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
    id: 'spain', level: 'Advanced', name: 'Spain pick and roll', cat: 'Pick and roll',
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
    id: 'flex', level: 'Intermediate', name: 'Flex', cat: 'Screens off the ball',
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
    id: 'floppy', level: 'Advanced', name: 'Floppy', cat: 'Screens off the ball',
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
    id: 'box', level: 'Intermediate', name: 'Box inbound (baseline)', cat: 'Inbounds', ball: 3,
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
  // ---------- More sets ----------
  def({
    id: 'ucla', level: 'Intermediate', name: 'UCLA cut', cat: 'Cuts',
    blurb: 'Pass to the wing, then cut off the high post back screen straight to the rim.',
    start: { 1: [250, 320], 2: [420, 240], 3: [80, 240], 4: [40, 40], 5: [250, 205] },
    beats: [
      ['Pass to wing', 1.0, '1 passes to 2 on the right wing.', { b: ['pass', 2, 0.15, 0.6] }],
      ['UCLA cut', 1.7, "1 cuts off 5's back screen at the high post, straight to the rim.", { m: { 1: [[275, 250], [232, 190], [245, 85]] }, s: [5], pc: { 1: 'explode' } }],
      ['Lob', 1.0, '2 throws it to 1 at the rim.', { b: ['pass', 1, 0.05, 0.6] }],
      ['Layup', 1.2, '1 finishes.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'iverson', level: 'Intermediate', name: 'Iverson cut', cat: 'Cuts',
    blurb: 'A wing runs across the top off both elbow screens and catches on the other side.',
    start: { 1: [250, 330], 2: [420, 180], 3: [80, 180], 4: [210, 195], 5: [290, 195] },
    beats: [
      ['Set', 1.0, '4 and 5 at the elbows. 2 on the right wing.', { dr: true }],
      ['Iverson cut', 1.8, '2 runs over the top of 5, then 4, to the left wing.', { m: { 2: [[330, 232], [250, 252], [170, 240], [105, 215]] }, s: [5, 4], pc: { 2: 'explode' }, dr: true }],
      ['Pass', 1.0, '1 hits 2 on the left wing.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Jumper', 1.3, '2 rises up.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'zipper', level: 'Intermediate', name: 'Zipper', cat: 'Screens off the ball',
    blurb: '2 zips straight up the lane line off a screen to catch at the top, then attacks.',
    start: { 1: [250, 320], 2: [180, 70], 3: [440, 60], 4: [175, 140], 5: [330, 80] },
    beats: [
      ['Dribble to wing', 1.4, '1 dribbles to the left wing.', { m: { 1: [[170, 300], [95, 250]] } }],
      ['Zipper', 1.5, "2 zips up the lane line off 4's screen to the top.", { m: { 2: [[185, 160], [215, 270], [250, 318]] }, s: [4], pc: { 2: 'explode' }, dr: true }],
      ['Pass', 1.0, '1 swings it to 2 at the top.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Attack', 1.5, '2 drives right.', { m: { 2: [[300, 250], [285, 120]] }, pc: { 2: 'early' } }],
      ['Layup', 1.2, '2 finishes.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'chicago', level: 'Advanced', name: 'Chicago', cat: 'Screens off the ball',
    blurb: 'A pin-down flows straight into a dribble handoff, so the shooter comes off two actions in a row.',
    start: { 1: [250, 320], 2: [130, 60], 3: [440, 60], 4: [120, 170], 5: [330, 190] },
    beats: [
      ['Pass to the slot', 1.2, '5 lifts to the left slot and 1 passes to 5.', { m: { 5: [[260, 260], [195, 300]] }, b: ['pass', 5, 0.5, 0.85] }],
      ['Pin-down', 1.5, '4 screens down and 2 comes up off it.', { m: { 4: [[140, 105]], 2: [[100, 140], [130, 250]] }, s: [4], pc: { 2: 'explode' } }],
      ['Handoff', 1.2, '2 comes right into a handoff from 5.', { m: { 2: [[165, 290], [215, 285]] }, s: [5], b: ['pass', 2, 0.35, 0.6] }],
      ['Drive', 1.5, '2 turns the corner and drives.', { m: { 2: [[262, 220], [252, 100]] }, pc: { 2: 'early' } }],
      ['Layup', 1.2, '2 finishes.', { b: ['shot', 0.1, 0.6] }],
    ],
  }),
  def({
    id: 'hammer', level: 'Advanced', name: 'Hammer', cat: 'Screens off the ball',
    blurb: 'Baseline drive, and a back screen on the weak side frees the corner shooter for the skip pass.',
    start: { 1: [420, 240], 2: [250, 320], 3: [90, 120], 4: [180, 60], 5: [330, 160] },
    ball: 1,
    beats: [
      ['Set', 1.0, '1 on the right wing. 3 low on the left side, 4 on the left block.', { dr: true }],
      ['Baseline drive', 1.6, '1 drives the right baseline.', { m: { 1: [[445, 140], [380, 62]] } }],
      ['Hammer screen', 1.4, "4 screens 3's defender and 3 fades to the corner.", { m: { 4: [[112, 92]], 3: [[70, 80], [40, 40]] }, s: [4], pc: { 3: 'explode' } }],
      ['Skip pass', 1.0, '1 skips it all the way across to 3.', { b: ['pass', 3, 0.05, 0.6] }],
      ['Corner three', 1.3, '3 shoots.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
  def({
    id: 'elevator', level: 'Advanced', name: 'Elevator doors', cat: 'Screens off the ball',
    blurb: 'The shooter runs up between two screeners, who close the gap behind them like elevator doors.',
    start: { 1: [400, 250], 2: [250, 60], 3: [80, 230], 4: [215, 200], 5: [285, 200] },
    beats: [
      ['Set', 1.0, '4 and 5 side by side at the elbows with a gap between them. 2 under the rim.', { dr: true }],
      ['Doors close', 1.6, '2 runs up through the gap, then 4 and 5 step together to shut the doors.', { m: { 2: [[250, 150], [250, 285]], 4: [[238, 205]], 5: [[262, 205]] }, s: [4, 5], pc: { 2: 'explode', 4: 'late', 5: 'late' }, dr: true }],
      ['Pass', 1.0, '1 hits 2 at the top.', { b: ['pass', 2, 0.1, 0.6] }],
      ['Three', 1.3, '2 shoots.', { b: ['shot', 0.15, 0.7] }],
    ],
  }),
];
