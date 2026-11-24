import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';

export type DictationTargetField = 'observations' | 'workDesc' | 'materials' | 'photoTag';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceDictationControlProps {
  activeTarget: DictationTargetField;
  onChangeTarget: (target: DictationTargetField) => void;
  onInsertTranscript: (
    target: DictationTargetField,
    transcript: string,
    mode: 'append' | 'replace',
    meta: { durationSec: number; source: 'gemini' | 'browser' }
  ) => void;
  externalTriggerCount?: number;
}

const TARGET_LABELS: Record<DictationTargetField, string> = {
  observations: 'Site Observations & Notes',
  workDesc: 'Work Executed Description',
  materials: 'Material Consumed',
  photoTag: 'Photo Log Tag',
};

function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const VoiceDictationControl: React.FC<VoiceDictationControlProps> = ({
  activeTarget,
  onChangeTarget,
  onInsertTranscript,
  externalTriggerCount = 0,
}) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'transcribing'>('idle');
  const [insertMode, setInsertMode] = useState<'append' | 'replace'>('append');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>(new Array(16).fill(12));
  const [livePreview, setLivePreview] = useState('');
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastDurationSec, setLastDurationSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [browserFallbackAvailable, setBrowserFallbackAvailable] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef<number>(0);
  const discardOnStopRef = useRef<boolean>(false);
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);
  const finalSpeechTextRef = useRef<string>('');
  const activeTargetRef = useRef<DictationTargetField>(activeTarget);
  const insertModeRef = useRef<'append' | 'replace'>(insertMode);
  const prevTriggerRef = useRef<number>(externalTriggerCount);

  useEffect(() => {
    activeTargetRef.current = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    insertModeRef.current = insertMode;
  }, [insertMode]);

  const cleanupStreamsAndTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore stop errors if already ended
      }
      speechRecRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setLevels(new Array(16).fill(12));
  };

  useEffect(() => {
    return () => {
      cleanupStreamsAndTimers();
      if (lastAudioUrl) {
        URL.revokeObjectURL(lastAudioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to encode audio clip.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
      reader.readAsDataURL(blob);
    });

  const transcribeAudioBlob = async (blob: Blob, durationSec: number) => {
    setStatus('transcribing');
    setErrorMsg(null);
    setStatusNote(null);

    try {
      const base64Audio = await blobToBase64(blob);
      const res = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: blob.type || 'audio/webm',
          fieldContext: TARGET_LABELS[activeTargetRef.current],
        }),
      });
      const rawText = await res.text();
      let data: { text?: string; error?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
        throw new Error(
          `Server returned a non-JSON response (HTTP ${res.status})${snippet ? `: ${snippet}` : '.'}`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || `Transcription failed (HTTP ${res.status}).`);
      }

      const transcript = (data.text || '').trim();
      if (!transcript) {
        throw new Error('Transcription returned empty text. Please try recording again.');
      }

      setLastTranscript(transcript);
      setLastDurationSec(durationSec);
      setBrowserFallbackAvailable('');
      onInsertTranscript(activeTargetRef.current, transcript, insertModeRef.current, {
        durationSec,
        source: 'gemini',
      });
      setStatusNote(
        `Transcribed ${formatTimer(durationSec)} clip into ${TARGET_LABELS[activeTargetRef.current]}.`
      );
      setStatus('idle');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to transcribe audio recording.';
      setErrorMsg(msg);
      const capturedSpeech = finalSpeechTextRef.current.trim();
      if (capturedSpeech) {
        setBrowserFallbackAvailable(capturedSpeech);
      }
      setStatus('idle');
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setStatusNote(null);
    setBrowserFallbackAvailable('');
    setLivePreview('');
    finalSpeechTextRef.current = '';
    discardOnStopRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg(
        'Microphone recording is not supported in this browser or context. Ensure HTTPS and microphone permissions are enabled.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickSupportedAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const wasDiscarded = discardOnStopRef.current;
        const durationSnapshot = Math.max(1, elapsedRef.current);
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });

        cleanupStreamsAndTimers();

        if (wasDiscarded) {
          setElapsedSec(0);
          elapsedRef.current = 0;
          setStatus('idle');
          return;
        }

        if (lastAudioUrl) {
          URL.revokeObjectURL(lastAudioUrl);
        }
        const url = URL.createObjectURL(blob);
        setLastAudioUrl(url);
        setLastDurationSec(durationSnapshot);
        void transcribeAudioBlob(blob, durationSnapshot);
      };

      // Live audio visualizer
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        const updateBars = () => {
          analyser.getByteFrequencyData(freqData);
          const next: number[] = [];
          for (let i = 0; i < 16; i++) {
            const val = freqData[i % freqData.length] || 0;
            next.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))));
          }
          setLevels(next);
          rafRef.current = requestAnimationFrame(updateBars);
        };
        rafRef.current = requestAnimationFrame(updateBars);
      }

      // Optional live browser speech preview alongside MediaRecorder
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechCtor) {
        try {
          const rec = new SpeechCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (ev) => {
            let finalStr = finalSpeechTextRef.current;
            let interimStr = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const txt = ev.results[i][0]?.transcript || '';
              if (ev.results[i].isFinal) {
                finalStr = `${finalStr} ${txt}`.trim();
              } else {
                interimStr = `${interimStr} ${txt}`.trim();
              }
            }
            finalSpeechTextRef.current = finalStr;
            setLivePreview(`${finalStr} ${interimStr}`.trim());
          };
          rec.onerror = () => {
            // Live preview is optional; MediaRecorder remains primary
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {
          speechRecRef.current = null;
        }
      }

      elapsedRef.current = 0;
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          elapsedRef.current += 1;
          setElapsedSec(elapsedRef.current);
        }
      }, 1000);

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setStatus('recording');
    } catch (err: unknown) {
      cleanupStreamsAndTimers();
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg(
          'Microphone permission was denied. Allow microphone access in browser settings to dictate site notes.'
        );
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setErrorMsg('No microphone device was detected on this machine.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to start microphone recording.');
      }
      setStatus('idle');
    }
  };

  useEffect(() => {
    if (externalTriggerCount > prevTriggerRef.current) {
      prevTriggerRef.current = externalTriggerCount;
      if (status === 'idle') {
        void startRecording();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTriggerCount]);

  const pauseOrResume = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setStatus('paused');
    } else if (rec.state === 'paused') {
      rec.resume();
      setStatus('recording');
    }
  };

  const stopAndTranscribe = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    discardOnStopRef.current = false;
    rec.stop();
  };

  const discardRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') {
      cleanupStreamsAndTimers();
      setStatus('idle');
      return;
    }
    discardOnStopRef.current = true;
    rec.stop();
  };

  const retryLastClip = async () => {
    if (!lastAudioUrl) return;
    const res = await fetch(lastAudioUrl);
    const blob = await res.blob();
    await transcribeAudioBlob(blob, Math.max(1, lastDurationSec));
  };

  return (
    <div className="p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic
            className={`w-3.5 h-3.5 ${
              status === 'recording'
                ? 'text-red-600 animate-pulse'
                : status === 'transcribing'
                ? 'text-orange-600'
                : 'text-orange-600'
            }`}
          />
          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            Voice-to-Text Field Dictation
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setInsertMode('append')}
            className={`px-2 py-0.5 rounded font-medium ${
              insertMode === 'append'
                ? 'bg-[#0F2137] text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Append
          </button>
          <button
            type="button"
            onClick={() => setInsertMode('replace')}
            className={`px-2 py-0.5 rounded font-medium ${
              insertMode === 'replace'
                ? 'bg-[#0F2137] text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Replace
          </button>
        </div>
      </div>

      {/* Target Field + Primary Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <select
          value={activeTarget}
          disabled={status !== 'idle'}
          onChange={(e) => onChangeTarget(e.target.value as DictationTargetField)}
          aria-label="Dictation target field"
          className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-60"
        >
          <option value="observations">Dictate into: Site Observations & Field Notes</option>
          <option value="workDesc">Dictate into: Work Executed Description</option>
          <option value="materials">Dictate into: Material Consumed</option>
          <option value="photoTag">Dictate into: Photo Log Tag</option>
        </select>

        {status === 'idle' && (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#0F2137] hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Mic className="w-3.5 h-3.5 text-orange-400" />
            <span>Start Dictation</span>
          </button>
        )}

        {(status === 'recording' || status === 'paused') && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={pauseOrResume}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-medium"
              title={status === 'paused' ? 'Resume recording' : 'Pause recording'}
            >
              {status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{status === 'paused' ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              type="button"
              onClick={stopAndTranscribe}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop & Transcribe</span>
            </button>
            <button
              type="button"
              onClick={discardRecording}
              className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Discard recording"
              aria-label="Discard recording"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {status === 'transcribing' && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-xs font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Transcribing audio...</span>
          </div>
        )}
      </div>

      {/* Live Waveform & Timer while Recording */}
      {(status === 'recording' || status === 'paused') && (
        <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'recording' ? 'bg-red-600 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {status === 'recording' ? 'Listening' : 'Paused'} · {TARGET_LABELS[activeTarget]}
              </span>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {formatTimer(elapsedSec)}
            </span>
          </div>

          <div className="h-7 flex items-end gap-1 px-1" aria-hidden="true">
            {levels.map((lvl, i) => (
              <div
                key={i}
                className={`flex-1 rounded-xs transition-all duration-75 ${
                  status === 'recording' ? 'bg-orange-500' : 'bg-slate-400'
                }`}
                style={{ height: `${Math.max(14, status === 'paused' ? 16 : lvl)}%` }}
              />
            ))}
          </div>

          {livePreview && (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded border border-slate-200/80 dark:border-slate-700">
              <span className="text-slate-400 mr-1">Live caption:</span>
              {livePreview}
            </div>
          )}
        </div>
      )}

      {/* Audio Playback & Retry Strip */}
      {status === 'idle' && lastAudioUrl && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Volume2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <audio src={lastAudioUrl} controls className="h-7 max-w-[230px]" />
            <span className="font-mono text-slate-500 tabular-nums shrink-0">
              {formatTimer(lastDurationSec)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void retryLastClip()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-orange-600"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Re-transcribe</span>
          </button>
        </div>
      )}

      {/* Confirmation or Error Messages */}
      {statusNote && (
        <div className="flex items-start gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <span>{statusNote}</span>
            {lastTranscript && (
              <span className="block text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                &ldquo;{lastTranscript}&rdquo;
              </span>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          {browserFallbackAvailable && (
            <button
              type="button"
              onClick={() => {
                onInsertTranscript(activeTarget, browserFallbackAvailable, insertMode, {
                  durationSec: lastDurationSec,
                  source: 'browser',
                });
                setStatusNote(
                  `Inserted captured speech caption into ${TARGET_LABELS[activeTarget]}.`
                );
                setErrorMsg(null);
                setBrowserFallbackAvailable('');
              }}
              className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              Use captured browser speech text instead
            </button>
          )}
        </div>
      )}
    </div>
  );
};
