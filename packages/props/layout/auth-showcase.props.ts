/** One generated example shown beside the login and sign-up forms. */
export interface AuthShowcaseSlide {
  /** Short line describing what the clip shows. */
  caption: string;
  id: string;
  /** Name of the model that generated the clip. */
  modelLabel: string;
  /** Frame 0 of the clip, so the still-to-video handoff has no flash. */
  posterSrc: string;
  /** Accessible name of the control that jumps to this example. */
  selectLabel: string;
  videoSrc: string;
}

export interface AuthShowcaseProps {
  /** Accessible name of the control that pauses the example video. */
  pauseLabel: string;
  /** Accessible name of the control that resumes the example video. */
  playLabel: string;
  /** Accessible name of the whole showcase panel. */
  regionLabel: string;
  slides: readonly AuthShowcaseSlide[];
}
