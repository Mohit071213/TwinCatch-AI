import type {
  TwinLanguage,
  VoicePitchWarmth,
  VoiceProsodyPreset,
  VoiceProviderId,
} from '../types';

export interface VoiceOption {
  id: string;
  label: string;
  shortName: string;
  gender: 'Male' | 'Female';
  categoryLabel: 'Conversational Multilingual (Hindi / Hinglish)' | 'Native Indian Neural';
  languageHint: TwinLanguage | 'Multilingual';
  style: string;
  recommendedPreset?: VoiceProsodyPreset;
}

export interface ProsodyPresetConfig {
  id: VoiceProsodyPreset;
  label: string;
  description: string;
  pace: number;
  pitchWarmth: VoicePitchWarmth;
  naturalPauses: boolean;
}

export const VOICE_PROSODY_PRESETS: ProsodyPresetConfig[] = [
  {
    id: 'warm_storyteller',
    label: 'Warm Storyteller',
    description: 'Rich chest warmth, natural thinking breaths, unhurried human cadence',
    pace: 0.95,
    pitchWarmth: 'warm',
    naturalPauses: true,
  },
  {
    id: 'friendly_explainer',
    label: 'Friendly Explainer',
    description: 'Approachable conversational flow built for clear everyday explanations',
    pace: 0.98,
    pitchWarmth: 'natural',
    naturalPauses: true,
  },
  {
    id: 'calm_mentor',
    label: 'Calm Mentor',
    description: 'Grounded resonance with deliberate emphasis pauses between key ideas',
    pace: 0.92,
    pitchWarmth: 'warm',
    naturalPauses: true,
  },
  {
    id: 'lively_creator',
    label: 'Lively Creator',
    description: 'Expressive upward lift for punchy comedy hooks and brisk engagement',
    pace: 1.04,
    pitchWarmth: 'bright',
    naturalPauses: true,
  },
];

export const PITCH_WARMTH_OPTIONS: Array<{
  id: VoicePitchWarmth;
  label: string;
  hint: string;
}> = [
  { id: 'warm', label: 'Warm & Deep (-4Hz)', hint: 'Rich conversational warmth, never tinny' },
  { id: 'natural', label: 'Natural Human (0Hz)', hint: 'Neutral relaxed baseline' },
  { id: 'bright', label: 'Bright & Clear (+4Hz)', hint: 'Slightly lifted expressive clarity' },
];

export const FREE_HINDI_VOICES: VoiceOption[] = [
  // Expressive Conversational Multilingual Male Voices (Hindi / Hinglish / English)
  {
    id: 'en-US-AndrewMultilingualNeural',
    shortName: 'Andrew Multilingual',
    label: 'Andrew Multilingual — Warm Human Storyteller (Male · Hindi / Hinglish)',
    gender: 'Male',
    categoryLabel: 'Conversational Multilingual (Hindi / Hinglish)',
    languageHint: 'Multilingual',
    style: 'Warm, confident, authentic conversational cadence built for human-like Hindi & Hinglish explaining',
    recommendedPreset: 'warm_storyteller',
  },
  {
    id: 'en-US-BrianMultilingualNeural',
    shortName: 'Brian Multilingual',
    label: 'Brian Multilingual — Sincere Conversational Mentor (Male · Hindi / Hinglish)',
    gender: 'Male',
    categoryLabel: 'Conversational Multilingual (Hindi / Hinglish)',
    languageHint: 'Multilingual',
    style: 'Approachable, sincere friend-like tone for relaxed knowledge & comedy storytelling',
    recommendedPreset: 'friendly_explainer',
  },
  // Native Indian Male Voices
  {
    id: 'hi-IN-MadhurNeural',
    shortName: 'Madhur Neural',
    label: 'Madhur Neural — Native Warm Hindi (Male · Hindi / Hinglish)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Hindi',
    style: 'Grounded native Devanagari Hindi pronunciation with calm editorial depth',
    recommendedPreset: 'calm_mentor',
  },
  {
    id: 'en-IN-PrabhatNeural',
    shortName: 'Prabhat Neural',
    label: 'Prabhat Neural — Conversational Indian Founder (Male · Hinglish / English)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Hinglish',
    style: 'Crisp Indian English & Hinglish founder cadence',
    recommendedPreset: 'friendly_explainer',
  },
  // Expressive Conversational Multilingual Female Voices (Hindi / Hinglish / English)
  {
    id: 'en-US-AvaMultilingualNeural',
    shortName: 'Ava Multilingual',
    label: 'Ava Multilingual — Expressive Caring Explainer (Female · Hindi / Hinglish)',
    gender: 'Female',
    categoryLabel: 'Conversational Multilingual (Hindi / Hinglish)',
    languageHint: 'Multilingual',
    style: 'Expressive, caring human inflection across Devanagari Hindi, Hinglish & English',
    recommendedPreset: 'warm_storyteller',
  },
  {
    id: 'en-US-EmmaMultilingualNeural',
    shortName: 'Emma Multilingual',
    label: 'Emma Multilingual — Clear Conversational Host (Female · Hindi / Hinglish)',
    gender: 'Female',
    categoryLabel: 'Conversational Multilingual (Hindi / Hinglish)',
    languageHint: 'Multilingual',
    style: 'Warm, upbeat natural explainer rhythm without stiff newsreader flatness',
    recommendedPreset: 'friendly_explainer',
  },
  // Native Indian Female Voices
  {
    id: 'hi-IN-SwaraNeural',
    shortName: 'Swara Neural',
    label: 'Swara Neural — Native Expressive Hindi (Female · Hindi / Hinglish)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Hindi',
    style: 'Clear, empathetic native Devanagari Hindi delivery for tutorials & stories',
    recommendedPreset: 'warm_storyteller',
  },
  {
    id: 'en-IN-NeerjaNeural',
    shortName: 'Neerja Neural',
    label: 'Neerja Neural — Approachable Indian Presenter (Female · Hinglish / English)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'English',
    style: 'Poised Indian presenter voice ideal for crisp Hinglish & English explainers',
    recommendedPreset: 'calm_mentor',
  },
];

export const GEMINI_STUDIO_VOICES: VoiceOption[] = [
  {
    id: 'Charon',
    shortName: 'Charon',
    label: 'Charon (Deep Editorial Male)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Authoritative bass cadence',
  },
  {
    id: 'Puck',
    shortName: 'Puck',
    label: 'Puck (Energetic Conversational)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Lively creator hook delivery',
  },
  {
    id: 'Kore',
    shortName: 'Kore',
    label: 'Kore (Clear Studio Female)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Warm articulate explainer',
  },
  {
    id: 'Fenrir',
    shortName: 'Fenrir',
    label: 'Fenrir (Warm Baritone)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Calm documentary narrator',
  },
  {
    id: 'Zephyr',
    shortName: 'Zephyr',
    label: 'Zephyr (Articulate Neutral)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Clean balanced pace',
  },
  {
    id: 'Aoede',
    shortName: 'Aoede',
    label: 'Aoede (Expressive Storytelling Female)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Melodic narrative phrasing',
  },
  {
    id: 'Leda',
    shortName: 'Leda',
    label: 'Leda (Youthful Conversational)',
    gender: 'Female',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Fast-paced reels cadence',
  },
  {
    id: 'Orus',
    shortName: 'Orus',
    label: 'Orus (Structured Presenter)',
    gender: 'Male',
    categoryLabel: 'Native Indian Neural',
    languageHint: 'Multilingual',
    style: 'Sharp analytical tone',
  },
];

export function getFreeHindiVoiceOption(voiceId?: string): VoiceOption {
  return (
    FREE_HINDI_VOICES.find((v) => v.id === voiceId) ||
    FREE_HINDI_VOICES[0]
  );
}

export function defaultVoiceForProvider(
  provider: VoiceProviderId,
  language: TwinLanguage = 'Hindi'
): string {
  if (provider === 'free_hindi_neural') {
    if (language === 'English') return 'en-US-AvaMultilingualNeural';
    if (language === 'Hinglish') return 'en-US-AndrewMultilingualNeural';
    return 'en-US-AndrewMultilingualNeural';
  }
  if (provider === 'ambient_studio') return 'Studio Beat';
  return 'Charon';
}

export function samplePreviewText(language: TwinLanguage): string {
  if (language === 'Hindi') {
    return 'अरे सुनो — क्या आपने कभी सोचा है कि कुछ वीडियो सुनते ही अपने से क्यों लगते हैं? असली राज़ तेज़ बोलना नहीं है, बल्कि सही जगह रुकना, आवाज़ में गर्माहट रखना, और एक दोस्त की तरह बात समझाना है।';
  }
  if (language === 'Hinglish') {
    return 'Dekho yaar, honestly — sabse bada farq script se zyada bolne ke andaaz se padta hai. Jab aap natural pauses, warm tone aur ek insaan jaisi conversational rhythm rakhte ho, tab log poori baat end tak sunte hain.';
  }
  return 'Think about this for a second — why do some narrations sound instantly human while others feel stiff? It comes down to natural breathing pauses, pitch warmth, and conversational pacing.';
}
