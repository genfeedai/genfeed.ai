import { logger } from '@services/core/logger.service';
import { useEffect, useRef, useState } from 'react';
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
export function useVoiceCommands({ onTranscript, commands = [], continuous = false, interimResults = false, language = 'en-US', } = {}) {
    const recognitionRef = useRef(null);
    const onTranscriptRef = useRef(onTranscript);
    const commandsRef = useRef(commands);
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState(null);
    // Update refs when props change
    useEffect(() => {
        onTranscriptRef.current = onTranscript;
    }, [onTranscript]);
    useEffect(() => {
        commandsRef.current = commands;
    }, [commands]);
    useEffect(() => {
        const SR = window.SpeechRecognition ||
            window.webkitSpeechRecognition;
        setIsSupported(!!SR);
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const SpeechRecognition = window.SpeechRecognition ||
            window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            logger.error('Speech recognition not supported in this browser');
            queueMicrotask(() => setIsSupported(false));
            return;
        }
        queueMicrotask(() => setIsSupported(true));
        const recognition = new SpeechRecognition();
        recognition.continuous = continuous;
        recognition.interimResults = interimResults;
        recognition.lang = language;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            logger.info('Voice input:', transcript);
            setTranscript(transcript);
            let commandMatched = false;
            for (const command of commandsRef.current) {
                const matches = transcript.match(command.pattern);
                if (matches) {
                    logger.info('Voice command matched:', command.description);
                    command.action(matches);
                    commandMatched = true;
                    break;
                }
            }
            if (!commandMatched && onTranscriptRef.current) {
                onTranscriptRef.current(transcript);
            }
        };
        recognition.onerror = (errorEvent) => {
            logger.error('Voice recognition error:', errorEvent);
            setIsListening(false);
            setError({
                error: errorEvent.error,
                message: errorEvent.message,
            });
            if (errorEvent.error === 'network') {
                logger.error('Network error: Web Speech API requires internet connection to Google servers');
            }
            else if (errorEvent.error === 'not-allowed') {
                logger.error('Microphone permission denied');
            }
            else if (errorEvent.error === 'no-speech') {
                logger.error('No speech detected');
            }
        };
        recognition.onend = () => {
            logger.info('Voice recognition ended');
            setIsListening(false);
        };
        recognitionRef.current = recognition;
        // Cleanup function
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                }
                catch (error) {
                    logger.error('Failed to stop voice recognition:', error);
                }
                recognitionRef.current = null;
            }
        };
    }, [continuous, interimResults, language]);
    const start = () => {
        const recognition = recognitionRef.current;
        if (!recognition) {
            logger.error('Speech recognition not available');
            return false;
        }
        try {
            setError(null); // Clear previous errors
            recognition.start();
            setIsListening(true);
            logger.info('Voice recognition started');
            return true;
        }
        catch (error) {
            logger.error('Failed to start voice recognition:', error);
            return false;
        }
    };
    const stop = () => {
        const recognition = recognitionRef.current;
        if (recognition && isListening) {
            recognition.stop();
            setIsListening(false);
            logger.info('Voice recognition stopped');
        }
    };
    const toggle = () => {
        if (isListening) {
            stop();
        }
        else {
            start();
        }
    };
    return {
        error,
        isListening,
        isSupported,
        start,
        stop,
        toggle,
        transcript,
    };
}
//# sourceMappingURL=use-voice-commands.js.map