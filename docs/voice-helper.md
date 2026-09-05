# Voice helper

`helpers/listen` requests microphone and speech-recognition access and forces Apple's on-device recognizer; it never falls back to server recognition, writes audio or transcripts to disk, or emits transcripts anywhere except standard output. Its build embeds `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` from `helpers/Info.plist` in the bare executable. Electron consumes those transcript lines only inside the main process and never logs or forwards them to the renderer.

The global hold gesture uses `uiohook-napi`, which requires Input Monitoring or Accessibility access on macOS. A packaged Electron app must carry `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` in its own Info.plist as well as the helper's embedded values.
