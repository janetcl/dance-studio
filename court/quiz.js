// Quiz scenes: one decision each, seen through one player's eyes.
// play = a preset id, you = the player you are, freeze = [beat index, fraction of that beat],
// defense = where a defender goes to set up the read (they ease there over that beat),
// answerMoves = extra movement for you on the freeze beat, so the right answer can play out.
export const QUIZ = [
  {
    id: 'drive-kick-corner',
    play: 'preset-drive-kick',
    you: 'o5',
    freeze: [1, 0.72],
    // X5 leaves you to help on the drive.
    defense: { d5: { beat: 1, from: 0.25, to: [318, 150] } },
    prompt: '1 drives right at your side of the lane, and your defender slides over to help stop the ball. You’re in the right corner. What do you do?',
    choices: [
      { label: 'Stay in the corner, hands ready', correct: true, why: 'Your defender left you to help, so the corner three is the most open shot on the floor, and it’s a short pass for 1.' },
      { label: 'Cut to the rim', why: 'Cutting drags your defender back with you and crowds the lane 1 is driving into.' },
      { label: 'Run toward 1 for a handoff', why: 'Moving toward the ball brings your defender with you, and two players in one spot is easy to guard.' },
      { label: 'Get back on defense', why: 'Too early. Your team still has the ball and you’re the open player.' },
    ],
    rule: 'Your defender helps on a drive → be ready right where they left you.',
  },
  {
    id: 'backdoor-wing',
    play: 'preset-backdoor',
    you: 'o2',
    freeze: [1, 0.95],
    // X2 overplays you, standing in the passing lane.
    defense: { d2: { beat: 0, from: 0, to: [118, 262] } },
    prompt: 'You’re on the left wing and your defender is overplaying you, standing in the passing lane. 5 just caught it at the free-throw line. What do you do?',
    choices: [
      { label: 'Cut backdoor to the rim', correct: true, why: 'Your defender is on the wrong side of you, so the space behind them is wide open. 5 is facing the basket and can bounce it to you.' },
      { label: 'Step further out to get open', why: 'That’s what the overplay wants: you end up far from the basket and out of the play.' },
      { label: 'Stand still and call for it', why: 'Your defender is already in the passing lane. Standing still makes the steal easy.' },
      { label: 'Go set a screen for 1', why: 'You give up the best scoring chance on the floor: the open lane behind your defender.' },
    ],
    rule: 'Defender overplays you → go behind them.',
  },
  {
    id: 'pnr-roll',
    play: 'preset-pnr',
    you: 'o5',
    freeze: [2, 0.15],
    // X5 steps up to stop the ball as 1 comes off the screen.
    defense: { d5: { beat: 1, from: 0.5, to: [300, 296] } },
    prompt: 'You just set a ball screen at the top and 1 is coming off it to the right. Your defender steps up to stop the ball. What do you do?',
    choices: [
      { label: 'Roll hard to the rim', correct: true, why: 'Your defender is out on the ball, so nobody is between you and the basket. Roll and give 1 a target.' },
      { label: 'Pop out for a three', why: 'Popping works when your defender sags back. Here they stepped up, so the rim is the open spot.' },
      { label: 'Stay and screen again', why: 'The screen already worked. Staying just clogs the space 1 is driving into.' },
      { label: 'Back up to the half-court line', why: 'That takes you out of the play and leaves 1 against two defenders.' },
    ],
    rule: 'Screener’s defender steps up to the ball → roll to the rim.',
  },
  {
    id: 'post-crash',
    play: 'preset-post-up',
    you: 'o2',
    freeze: [4, 0.3],
    prompt: '5 goes up for a hook shot on the right block. You’re on the left wing, the side away from the ball. What do you do as the shot goes up?',
    choices: [
      { label: 'Crash the boards on the weak side', correct: true, why: 'Most missed shots bounce long to the side opposite the shot. Your defender is watching the ball, so you can get inside them.' },
      { label: 'Watch the shot', why: 'Standing still gives your defender the rebound if it misses.' },
      { label: 'Sprint back on defense', why: 'Someone should get back, but usually that’s the guards up top. From the wing you’re in the best spot to rebound.' },
      { label: 'Cut to the left corner', why: 'Moving away from the rim takes you out of rebounding position.' },
    ],
    rule: 'Shot goes up from the other side → crash the weak side.',
    answerMoves: { to: [205, 85], wp: [[150, 170]] },
  },
];
