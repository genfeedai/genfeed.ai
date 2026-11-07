import type { CinematicShort } from '../api-types/contracts/cinematic-short.contract';

/**
 * Initial platform templates; persisted admin edits own the catalog after seeding.
 * Style is described by feel, never by a studio, artist or film name.
 */
export const CINEMATIC_SHORTS: CinematicShort[] = [
  {
    aspectRatio: '21:9',
    delivery: { format: 'mp4', hasSound: true },
    description:
      'A 60 second hand-drawn 2D anime short in nine shots: a quiet opening, a discovery, rising tension, an explosive release and one tender last moment on a title card.',
    example: {
      deliveryFormat: 'mp4',
      sealText: '寓話',
      setting:
        'an ancient stone library tower on a cliff above a sea of clouds, wrapped in ivy and old pines',
      subject: 'a small red fox carrying a paper lantern',
      tagline: 'Every story begins with a blank page.',
      titleText: 'Fable 5.5',
    },
    fps: 24,
    key: 'cinematic-anime-short',
    label: 'Cinematic anime short',
    maxRuntimeSeconds: 90,
    negativeList: [
      'no 3D look: no plastic materials, CGI shading, visible polygons, game-engine lighting or computer-perfect perspective',
      'no vector look: no simple geometric shapes, perfect curves, uniform outlines, flat corporate illustration or basic gradients',
      'no web animation: no sliding layers, constant bobbing, floating parts, smooth software easing or puppet-like joint rotation',
      'no AI artifacts: no warped shapes, melted details, flicker, garbled text or a character design that changes between shots',
      'no Western cartoon designs, realistic rendering or soft painterly shading on the characters',
      'no tech advertising: no glowing neural networks, circuit patterns, chat bubbles, UI mockups, HUDs, particle logo reveals or typed-out text',
      'no people on screen',
      'no logos, feature lists, benchmarks or product claims',
    ],
    paletteArc: [
      {
        fromSecond: 0,
        name: 'last hour of night',
        palette:
          'cool moonlit blue and violet with one small warm lantern amber',
      },
      {
        fromSecond: 25,
        name: 'tension',
        palette: 'deep shadow blue with dusty amber from the lantern',
      },
      {
        fromSecond: 32,
        name: 'release',
        palette: 'first gold light crashing through shadow',
      },
      {
        fromSecond: 39,
        name: 'sunrise',
        palette:
          'overwhelming golden sunrise, glowing mist, warm colored shadows',
      },
      {
        fromSecond: 52,
        name: 'quiet return',
        palette: 'soft warm paper tones in low golden light',
      },
    ],
    qaPassLimit: 2,
    shots: [
      {
        action:
          'Black. Fade up on a vast blue-violet sea of clouds at the last hour of night. {{setting}}. One small warm light moves across a window. Tall grass sways in the foreground. Almost nothing else moves. Hold.',
        camera: 'Locked wide establishing shot, foreground grass in soft focus',
        endSeconds: 7,
        key: 'before-dawn',
        sound: 'Wind first, near silence, one distant creak',
        startSeconds: 0,
        title: 'Before dawn',
      },
      {
        action:
          'Inside, shelves climb into darkness, holding thousands of unique leaning, sagging, sun-faded books, some with moss on the spines. Moonlight falls in one dusty shaft. Tiny against all of this, {{subject}} enters from the left carrying a small light, sets it down and looks up.',
        camera: 'Wide interior, slow drift, subject small in the frame',
        endSeconds: 14,
        key: 'reading-hall',
        sound: 'Soft steps on stone, lantern flame, room tone',
        startSeconds: 7,
        title: 'The reading hall',
      },
      {
        action:
          'Close-up of {{subject}}. Small expressive movements: a head tilt, a sniff, then a blink with a hold on the closed frame. Lantern light shows in its eyes. Curious and a little afraid.',
        camera: 'Close-up, eye level, shallow depth',
        endSeconds: 18,
        key: 'the-character',
        sound: 'A lone felt piano motif enters',
        startSeconds: 14,
        title: 'The character',
      },
      {
        action:
          'An enormous open book rests on a lectern, its pages empty and yellowed. {{subject}} climbs up and touches the page. Silence. A single ink line draws itself in one confident brushstroke into a tiny sketched bird, which shivers, peels off the page and flaps into the air, still ink and paper.',
        camera: 'Medium shot, then push in on the page',
        endSeconds: 25,
        key: 'blank-book',
        sound: 'Ink on paper, a single soft wing flutter',
        startSeconds: 18,
        title: 'The blank book',
      },
      {
        action:
          'A book on a high shelf trembles, then a whole row. Dust sifts down in thin streams. The lantern flame leans sideways with no wind. {{subject}} shrinks back. Cut between shelves on hard, held key poses. One beat of total stillness at the end.',
        camera: 'Quick cuts between shelves on held poses, then a locked frame',
        endSeconds: 32,
        key: 'library-stirs',
        sound: 'Low strings, creaking wood, dust, then silence',
        startSeconds: 25,
        title: 'The library stirs',
      },
      {
        action:
          'Every book flies open at once. Thousands of pages tear free and fold into paper birds mid-air on sharp drawn frames. Low angle straight up the circular stairwell as the flock spirals in a huge vortex toward the dome. The old shutters break open and the first gold light crashes down the shaft.',
        camera: 'Hard cut to extreme low angle looking up the stairwell',
        endSeconds: 39,
        key: 'pages-burst',
        sound: 'Sudden roar of fluttering paper, wood splitting',
        startSeconds: 32,
        title: 'The pages burst',
      },
      {
        action:
          'Outside, the sun clears the sea of clouds. {{subject}} has climbed out onto a stone balcony, fur, cloth and grass whipping in the wind, tiny against the sky. It looks up, mouth slightly open. A great ring of wind rolls outward across the clouds.',
        camera: 'Wide from behind the subject, then a low reaction close-up',
        endSeconds: 44,
        key: 'sunrise',
        sound: 'Full orchestral swell, wind',
        startSeconds: 39,
        title: 'Sunrise',
      },
      {
        action:
          'High in the golden sky the flock pulls together into one colossal bird made of a hundred thousand pages, with handwriting and old illustrations visible across its wings. One enormous wingbeat with real weight, then it tears across the sky in a sweeping arc, leaving a curving trail of light, mist and loose paper. The widest, most awe-inspiring image in the film.',
        camera: 'Widest shot in the film, camera tracking the arc',
        endSeconds: 52,
        key: 'the-great-bird',
        sound: 'The piano motif returns at full scale, a huge wingbeat',
        startSeconds: 44,
        title: 'The great bird',
      },
      {
        action:
          'Quiet returns. Pages spiral down through sunbeams onto the balcony. One lands at the feet of {{subject}}, the only page still blank. It looks at the page, then at us, and reaches out. Ink blooms from under the touch and writes "{{titleText}}" in one brushed stroke. Below it, a small red seal presses into the paper, then one smaller brushed line: "{{tagline}}". Hold on the title. One last small movement. Fade to paper, then black.',
        camera: 'Slow push-in on the page, held on the title',
        endSeconds: 60,
        key: 'the-last-page',
        sound: 'One single soft piano note as the ink touches the page',
        startSeconds: 52,
        title: 'The last page',
      },
    ],
    soundSpec:
      'Original score and sound design only, no borrowed melodies. Wind and near silence first, then a lone felt piano motif when the character appears. Low strings and creaking wood during the tremor, a sudden roar of fluttering paper, a full orchestral swell at sunrise, the piano motif returning at full scale at the climax, and one soft piano note as the ink touches the last page. Effects: steps, lantern flame, ink, dust, page rustle, a huge wingbeat.',
    styleByFeel:
      'Traditional hand-drawn 2D anime for a finished theatrical film. Confident, delicate hand-inked line with subtle thickness variation. Clean cel colouring with simple hard-edged shadows and a soft natural palette. Richly detailed gouache-painted backgrounds with visible brushwork and layered depth. Colored shadows, glowing mist and drifting dust unite characters and background. Animation mostly on twos and threes with real weight, held key poses, smears on the fastest frames and overlapping movement in fur, grass, paper and dust. Paper creatures have creases, curled corners and faded ink and keep one consistent design.',
    titleCard: {
      hasSeal: true,
      treatment:
        'All text is brushed in ink on paper, in the final shot only. No web fonts and no text overlays.',
    },
  },
];

export function cinematicShortId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}
