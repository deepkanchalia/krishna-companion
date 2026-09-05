# Voice helper

`helpers/listen` requests microphone and speech-recognition access and forces Apple's on-device recognizer; it never falls back to server recognition, writes audio or transcripts to disk, or emits transcripts anywhere except standard output. Its build embeds `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` from `helpers/Info.plist` in the bare executable. When T5 wires the helper into Electron, the Electron app's Info.plist must also contain both usage-description keys so macOS can present the privacy prompts from the packaged app.
