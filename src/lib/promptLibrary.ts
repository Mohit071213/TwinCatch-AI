import type {
  ProductionStyle,
  PromptLibraryCategory,
  SceneVisualBeat,
  VisualPromptTemplate,
} from '../types';

export const PROMPT_LIBRARY_CATEGORIES: Array<'All' | PromptLibraryCategory> = [
  'All',
  'Comedy & Skit',
  'Science & Explainer',
  'Finance & Business',
  'Story & Cinema',
  'Creator Hooks',
];

export const VISUAL_PROMPT_LIBRARY: VisualPromptTemplate[] = [
  // ── Comedy & Skit ────────────────────────────────────────────────────────────
  {
    id: 'comedy_chat_ping',
    name: 'Incoming Manager Ping',
    category: 'Comedy & Skit',
    productionStyle: 'comedy_skit',
    themeMood: 'comedy_office',
    motionGraphicPreset: 'chat_thread_popup',
    cameraMotion: 'punch_zoom',
    visualCardType: 'reaction_chat',
    colorAccent: '#E09F5A',
    clipKeywords: ['office worker laptop coffee reaction', 'tired desk worker funny', 'corporate laptop typing'],
    directorPrompt:
      'Relatable workplace desk reaction with live animated chat notification card and punch-zoom reaction.',
    sampleCallout: 'BOSS: "QUICK 5-MIN SYNC" 👀',
    sampleSubBadge: '9:00 AM CALENDAR TRAP',
  },
  {
    id: 'comedy_punchline_freeze',
    name: 'Punchline Comic Burst',
    category: 'Comedy & Skit',
    productionStyle: 'comedy_skit',
    themeMood: 'comedy_office',
    motionGraphicPreset: 'comic_reaction_burst',
    cameraMotion: 'punch_zoom',
    visualCardType: 'comic_bubble',
    colorAccent: '#E09F5A',
    clipKeywords: ['shocked funny face reaction', 'person stressed deadline clock', 'laughing reaction gif'],
    directorPrompt:
      'Rapid snap punch-zoom with radiating comic burst vector strokes and expressive micro-shake on punchline cues.',
    sampleCallout: 'STILL ON SLIDE #1 💀',
    sampleSubBadge: '47 MINS LATER',
  },
  {
    id: 'comedy_chai_reality',
    name: 'Expectation vs. Cold Chai',
    category: 'Comedy & Skit',
    productionStyle: 'comedy_skit',
    themeMood: 'comedy_office',
    motionGraphicPreset: 'myth_reality_divider',
    cameraMotion: 'split_reveal',
    visualCardType: 'comparison_split',
    colorAccent: '#E09F5A',
    clipKeywords: ['iced coffee cup desk', 'tired worker holding mug', 'cafe friends laughing'],
    directorPrompt:
      'Animated diagonal split comparison contrasting optimistic calendar invites against reality.',
    sampleCallout: 'GARAM CHAI BECAME ICED TEA ☕',
    sampleSubBadge: 'REALITY CHECK',
  },
  {
    id: 'comedy_group_roast',
    name: 'Squad Reaction Closer',
    category: 'Comedy & Skit',
    productionStyle: 'comedy_skit',
    themeMood: 'comedy_office',
    motionGraphicPreset: 'comic_reaction_burst',
    cameraMotion: 'kinetic_pan',
    visualCardType: 'comic_bubble',
    colorAccent: '#E09F5A',
    clipKeywords: ['friends laughing coffee shop', 'happy coworkers smiling portrait', 'celebration reaction'],
    directorPrompt:
      'Warm energetic reaction pan paired with high-contrast social share bubble for closing CTAs.',
    sampleCallout: 'TAG YOUR "5-MIN" FRIEND 😂',
    sampleSubBadge: 'SHARE THE PAIN',
  },

  // ── Science & Explainer ──────────────────────────────────────────────────────
  {
    id: 'sci_orbital_hud',
    name: 'Orbital Microgravity HUD',
    category: 'Science & Explainer',
    productionStyle: 'visual_explainer',
    themeMood: 'cosmic_space',
    motionGraphicPreset: 'orbital_physics_sim',
    cameraMotion: 'orbit_drift',
    visualCardType: 'stat_callout',
    colorAccent: '#7CC6C4',
    clipKeywords: ['astronaut floating earth orbit', 'international space station earth', 'water droplet microgravity'],
    directorPrompt:
      'Rotating telemetry orbit rings and gravitational vector HUD sweeping over deep-space documentary footage.',
    sampleCallout: 'GRAVITY LOCK: OFF (0.00 G)',
    sampleSubBadge: 'ORBITAL PHYSICS',
  },
  {
    id: 'sci_neural_blueprint',
    name: 'Neural Synapse Blueprint',
    category: 'Science & Explainer',
    productionStyle: 'visual_explainer',
    themeMood: 'science_tech',
    motionGraphicPreset: 'neural_network_pulse',
    cameraMotion: 'kinetic_pan',
    visualCardType: 'stat_callout',
    colorAccent: '#7CC6C4',
    clipKeywords: ['brain neuron connection glow', 'scientist laboratory experiment', 'futuristic code microchip'],
    directorPrompt:
      'Blueprint grid with pulsing interconnected node graph illustrating cognitive, tech, or biological mechanisms.',
    sampleCallout: '3X FASTER PATTERN LOCK',
    sampleSubBadge: 'INSIDE THE BRAIN',
  },
  {
    id: 'sci_myth_buster_split',
    name: 'Myth vs. Lab Reality',
    category: 'Science & Explainer',
    productionStyle: 'visual_explainer',
    themeMood: 'mind_psychology',
    motionGraphicPreset: 'myth_reality_divider',
    cameraMotion: 'split_reveal',
    visualCardType: 'comparison_split',
    colorAccent: '#7CC6C4',
    clipKeywords: ['airport travelers waiting luggage', 'mirror reflection psychology experiment', 'optical illusion eye'],
    directorPrompt:
      'Sharp animated split-screen barrier contrasting popular assumptions against verified experimental outcomes.',
    sampleCallout: 'ASSUMPTION vs LAB EVIDENCE',
    sampleSubBadge: 'PROVEN STUDY',
  },
  {
    id: 'sci_nature_pulse',
    name: 'Living Earth Telemetry',
    category: 'Science & Explainer',
    productionStyle: 'visual_explainer',
    themeMood: 'nature_earth',
    motionGraphicPreset: 'orbital_physics_sim',
    cameraMotion: 'cinema_push',
    visualCardType: 'stat_callout',
    colorAccent: '#A7BA78',
    clipKeywords: ['ocean wave deep blue sunlight', 'aurora borealis night sky', 'rainforest canopy mist'],
    directorPrompt:
      'Slow atmospheric camera push over natural ecosystems overlaid with crisp environmental telemetry indicators.',
    sampleCallout: 'INVISIBLE ATMOSPHERIC SHIELD',
    sampleSubBadge: 'EARTH DESIGN',
  },

  // ── Finance & Business ───────────────────────────────────────────────────────
  {
    id: 'fin_compounding_curve',
    name: 'Compounding Growth Curve',
    category: 'Finance & Business',
    productionStyle: 'visual_explainer',
    themeMood: 'finance_business',
    motionGraphicPreset: 'compounding_curve_chart',
    cameraMotion: 'kinetic_pan',
    visualCardType: 'stat_callout',
    colorAccent: '#C8A96B',
    clipKeywords: ['stock chart growth screen', 'entrepreneur laptop cafe working', 'financial skyline sunset'],
    directorPrompt:
      'Animated exponential trajectory line drawing live across dark emerald financial textures with milestone markers.',
    sampleCallout: 'TIME BEATS TIMING EVERY TIME',
    sampleSubBadge: '10-YEAR CURVE',
  },
  {
    id: 'fin_salary_leak',
    name: 'Silent Cashflow Leak Audit',
    category: 'Finance & Business',
    productionStyle: 'visual_explainer',
    themeMood: 'finance_business',
    motionGraphicPreset: 'myth_reality_divider',
    cameraMotion: 'split_reveal',
    visualCardType: 'comparison_split',
    colorAccent: '#C8A96B',
    clipKeywords: ['person checking wallet smartphone', 'coffee bills calculator desk', 'coins jar savings'],
    directorPrompt:
      'Side-by-side breakdown contrasting impulsive recurring leaks against automated compounding habits.',
    sampleCallout: 'TINY HABITS vs LONG-TERM WEALTH',
    sampleSubBadge: 'CASHFLOW AUDIT',
  },
  {
    id: 'fin_founder_briefing',
    name: 'Executive Strategy Card',
    category: 'Finance & Business',
    productionStyle: 'creator_reel',
    themeMood: 'finance_business',
    motionGraphicPreset: 'kinetic_waveform_banner',
    cameraMotion: 'cinema_push',
    visualCardType: 'stat_callout',
    colorAccent: '#C8A96B',
    clipKeywords: ['startup team whiteboard strategy', 'founder talking office studio', 'modern bridge city horizon'],
    directorPrompt:
      'Composed editorial push-in with clean gold rule bar for business takeaways and founder rules.',
    sampleCallout: 'BUILD SYSTEMS, NOT STRESS',
    sampleSubBadge: 'CREATOR PLAYBOOK',
  },
  {
    id: 'fin_habit_meter',
    name: '30-Day Habit Meter',
    category: 'Finance & Business',
    productionStyle: 'visual_explainer',
    themeMood: 'mind_psychology',
    motionGraphicPreset: 'compounding_curve_chart',
    cameraMotion: 'kinetic_pan',
    visualCardType: 'stat_callout',
    colorAccent: '#C99E76',
    clipKeywords: ['journal notebook coffee morning desk', 'focused person working laptop', 'clock gears mechanism'],
    directorPrompt:
      'Progressive milestone curve visualizing small daily behavior gains compounding over 30 days.',
    sampleCallout: '1% DAILY GAIN = 37X YEARLY',
    sampleSubBadge: 'HABIT MATH',
  },

  // ── Story & Cinema ───────────────────────────────────────────────────────────
  {
    id: 'story_archival_plate',
    name: 'Archival Horizon Letterbox',
    category: 'Story & Cinema',
    productionStyle: 'story_cinema',
    themeMood: 'history_world',
    motionGraphicPreset: 'cinema_spotlight_sweep',
    cameraMotion: 'cinema_push',
    visualCardType: 'kinetic_quote',
    colorAccent: '#CFA668',
    clipKeywords: ['ancient stone ruins golden sunset', 'vintage map compass parchment', 'historic palace architecture'],
    directorPrompt:
      '16px cinema letterbox mattes with warm golden spotlight sweep and slow push-in on heritage landscapes.',
    sampleCallout: 'BUILT CENTURIES BEFORE US',
    sampleSubBadge: 'CHAPTER 01',
  },
  {
    id: 'story_moody_quote',
    name: 'Atmospheric Quote Ribbon',
    category: 'Story & Cinema',
    productionStyle: 'story_cinema',
    themeMood: 'mind_psychology',
    motionGraphicPreset: 'cinema_spotlight_sweep',
    cameraMotion: 'orbit_drift',
    visualCardType: 'kinetic_quote',
    colorAccent: '#D8B36A',
    clipKeywords: ['person window rain reflection moody', 'walking quiet street morning sun', 'candlelight library archive'],
    directorPrompt:
      'Drifting chiaroscuro illumination sweep with understated serif/monospace quote ribbon for dramatic turns.',
    sampleCallout: 'ONE DECISION CHANGED EVERYTHING',
    sampleSubBadge: 'TURNING POINT',
  },
  {
    id: 'story_human_journey',
    name: 'Golden Hour Portrait Match',
    category: 'Story & Cinema',
    productionStyle: 'story_cinema',
    themeMood: 'studio_editorial',
    motionGraphicPreset: 'cinema_spotlight_sweep',
    cameraMotion: 'cinema_push',
    visualCardType: 'kinetic_quote',
    colorAccent: '#B69A65',
    clipKeywords: ['smiling person warm sunset light', 'traveler mountain overlook sunrise', 'artist studio portrait'],
    directorPrompt:
      'Warm color-harmonized portrait backdrop keeping tonal lighting consistent with the active host.',
    sampleCallout: 'STILL RELEVANT TODAY',
    sampleSubBadge: 'EPILOGUE',
  },
  {
    id: 'story_night_observatory',
    name: 'Midnight Wonder Drift',
    category: 'Story & Cinema',
    productionStyle: 'story_cinema',
    themeMood: 'cosmic_space',
    motionGraphicPreset: 'orbital_physics_sim',
    cameraMotion: 'orbit_drift',
    visualCardType: 'kinetic_quote',
    colorAccent: '#D8B36A',
    clipKeywords: ['milky way night sky observatory', 'stargazing silhouette person', 'carina nebula telescope'],
    directorPrompt:
      'Slow celestial drift combining subtle orbital geometry with contemplative narrative typography.',
    sampleCallout: 'LOOK UP FOR 30 SECONDS ✨',
    sampleSubBadge: 'PERSPECTIVE SHIFT',
  },

  // ── Creator Hooks ────────────────────────────────────────────────────────────
  {
    id: 'hook_3sec_attention',
    name: '3-Second Curiosity Opener',
    category: 'Creator Hooks',
    productionStyle: 'creator_reel',
    themeMood: 'studio_editorial',
    motionGraphicPreset: 'kinetic_waveform_banner',
    cameraMotion: 'punch_zoom',
    visualCardType: 'reaction_chat',
    colorAccent: '#B69A65',
    clipKeywords: ['creator speaking microphone studio', 'curious person looking camera', 'smartphone filming desk'],
    directorPrompt:
      'Crisp first-3-second hook punch zoom with oscillating audio-reactive waveform stripe.',
    sampleCallout: 'WAIT TILL YOU HEAR THIS 👀',
    sampleSubBadge: '01 OPENING HOOK',
  },
  {
    id: 'hook_studio_behind_scenes',
    name: 'Studio Desk B-Roll Cut',
    category: 'Creator Hooks',
    productionStyle: 'creator_reel',
    themeMood: 'studio_editorial',
    motionGraphicPreset: 'neural_network_pulse',
    cameraMotion: 'kinetic_pan',
    visualCardType: 'stat_callout',
    colorAccent: '#B69A65',
    clipKeywords: ['podcast microphone neon warm desk', 'video editing monitor timeline', 'designer notebook sketching'],
    directorPrompt:
      'Smooth sideways desk pan layered with subtle studio grid lines and clear bullet-point callout.',
    sampleCallout: 'WHY 90% MISS THIS STEP',
    sampleSubBadge: 'KEY INSIGHT',
  },
  {
    id: 'hook_dm_question',
    name: 'Viewer Question DM Card',
    category: 'Creator Hooks',
    productionStyle: 'creator_reel',
    themeMood: 'comedy_office',
    motionGraphicPreset: 'chat_thread_popup',
    cameraMotion: 'split_reveal',
    visualCardType: 'reaction_chat',
    colorAccent: '#E09F5A',
    clipKeywords: ['person holding phone smiling', 'friends talking coffee cafe', 'typing smartphone message'],
    directorPrompt:
      'Pop-in viewer question notification bubble framing conversational answers cleanly.',
    sampleCallout: 'YOU ASKED: HOW DOES THIS WORK?',
    sampleSubBadge: 'VIEWER Q&A',
  },
  {
    id: 'hook_save_share_cta',
    name: 'Kinetic Save & Share Closer',
    category: 'Creator Hooks',
    productionStyle: 'creator_reel',
    themeMood: 'studio_editorial',
    motionGraphicPreset: 'kinetic_waveform_banner',
    cameraMotion: 'cinema_push',
    visualCardType: 'kinetic_quote',
    colorAccent: '#B69A65',
    clipKeywords: ['smiling creator portrait warm light', 'thumbs up friendly studio', 'notebook checklist coffee'],
    directorPrompt:
      'Clean closing push-in featuring high-contrast bookmark and follow reminder card.',
    sampleCallout: 'SAVE THIS FOR PART 2 ⚡',
    sampleSubBadge: 'FOLLOW & SHARE',
  },
];

export function getPromptTemplateById(id?: string): VisualPromptTemplate | undefined {
  if (!id) return undefined;
  return VISUAL_PROMPT_LIBRARY.find((t) => t.id === id);
}

export function selectFallbackTemplatesForScript(
  mood: SceneVisualBeat['themeMood'],
  prodStyle: Exclude<ProductionStyle, 'auto_genre'>
): VisualPromptTemplate[] {
  if (prodStyle === 'comedy_skit' || mood === 'comedy_office') {
    return [
      getPromptTemplateById('comedy_chat_ping')!,
      getPromptTemplateById('comedy_punchline_freeze')!,
      getPromptTemplateById('comedy_chai_reality')!,
      getPromptTemplateById('comedy_punchline_freeze')!,
      getPromptTemplateById('hook_studio_behind_scenes')!,
      getPromptTemplateById('comedy_group_roast')!,
    ];
  }
  if (mood === 'cosmic_space' || mood === 'science_tech') {
    return [
      getPromptTemplateById('hook_3sec_attention')!,
      getPromptTemplateById(mood === 'cosmic_space' ? 'sci_orbital_hud' : 'sci_neural_blueprint')!,
      getPromptTemplateById('sci_myth_buster_split')!,
      getPromptTemplateById('sci_neural_blueprint')!,
      getPromptTemplateById(mood === 'cosmic_space' ? 'story_night_observatory' : 'sci_nature_pulse')!,
      getPromptTemplateById('hook_save_share_cta')!,
    ];
  }
  if (mood === 'finance_business') {
    return [
      getPromptTemplateById('fin_salary_leak')!,
      getPromptTemplateById('fin_compounding_curve')!,
      getPromptTemplateById('fin_habit_meter')!,
      getPromptTemplateById('fin_founder_briefing')!,
      getPromptTemplateById('fin_compounding_curve')!,
      getPromptTemplateById('hook_save_share_cta')!,
    ];
  }
  if (prodStyle === 'story_cinema' || mood === 'history_world') {
    return [
      getPromptTemplateById('story_archival_plate')!,
      getPromptTemplateById('story_moody_quote')!,
      getPromptTemplateById('story_archival_plate')!,
      getPromptTemplateById('story_night_observatory')!,
      getPromptTemplateById('story_moody_quote')!,
      getPromptTemplateById('story_human_journey')!,
    ];
  }
  return [
    getPromptTemplateById('hook_3sec_attention')!,
    getPromptTemplateById('hook_dm_question')!,
    getPromptTemplateById('sci_myth_buster_split')!,
    getPromptTemplateById('hook_studio_behind_scenes')!,
    getPromptTemplateById('fin_habit_meter')!,
    getPromptTemplateById('hook_save_share_cta')!,
  ];
}
