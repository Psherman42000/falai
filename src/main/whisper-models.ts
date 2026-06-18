export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v3';

export interface WhisperModelOption {
  value: WhisperModelName;
  label: string;
  hint: string;
}

export const WHISPER_MODELS: WhisperModelOption[] = [
  { value: 'tiny',     label: 'tiny',     hint: '39 MB, rápido, menos preciso' },
  { value: 'base',     label: 'base',     hint: '74 MB, equilíbrio (padrão)' },
  { value: 'small',    label: 'small',    hint: '244 MB, mais preciso' },
  { value: 'medium',   label: 'medium',   hint: '769 MB, melhor, mais lento' },
  { value: 'large',    label: 'large',    hint: '1.5 GB, alta qualidade' },
  { value: 'large-v3', label: 'large-v3', hint: '2.9 GB, melhor qualidade' },
];
