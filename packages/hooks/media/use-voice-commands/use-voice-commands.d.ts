export type VoiceCommand = {
    pattern: RegExp;
    action: (matches: RegExpMatchArray) => void;
    description: string;
};
export interface UseVoiceCommandsOptions {
    onTranscript?: (text: string) => void;
    commands?: VoiceCommand[];
    continuous?: boolean;
    interimResults?: boolean;
    language?: string;
}
/**
 * Enhanced voice recognition hook with support for voice commands
 *
 * @example
 * ```tsx
 * const { isListening, toggle, transcript } = useVoiceCommands({
 *   onTranscript: (text) => console.log('Said:', text),
 *   commands: [
 *     {
 *       pattern: /change model to (.+)/i,
 *       action: (matches) => setModel(matches[1]),
 *       description: 'Change model to [model name]'
 *     }
 *   ]
 * });
 * ```
 */
export declare function useVoiceCommands({ onTranscript, commands, continuous, interimResults, language, }?: UseVoiceCommandsOptions): {
    error: any;
    isListening: any;
    isSupported: any;
    start: () => boolean;
    stop: () => void;
    toggle: () => void;
    transcript: any;
};
//# sourceMappingURL=use-voice-commands.d.ts.map