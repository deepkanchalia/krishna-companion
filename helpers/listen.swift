import Foundation
import Speech
import AVFoundation

private let defaultTimeoutMilliseconds = 8_000

private func timeoutMilliseconds(from arguments: [String]) -> Int {
    for argument in arguments where argument.hasPrefix("--timeout=") {
        let value = argument.dropFirst("--timeout=".count)
        if let milliseconds = Int(value), milliseconds >= 0 {
            return milliseconds
        }
    }
    return defaultTimeoutMilliseconds
}

private func writeLine(_ line: String, to handle: FileHandle) {
    guard let data = "\(line)\n".data(using: .utf8) else { return }
    handle.write(data)
}

private final class Listener: @unchecked Sendable {
    private let audioEngine = AVAudioEngine()
    private let recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    private var recognitionTask: SFSpeechRecognitionTask?
    private var signalSource: DispatchSourceSignal?
    private var inputTapInstalled = false
    private var finished = false
    private let readyLock = NSLock()
    private var printedReady = false

    func run(timeoutMilliseconds: Int) {
        installTerminationHandler()
        watchStandardInput()

        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMilliseconds)) { [weak self] in
            self?.finish(code: 0)
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self, !self.finished else { return }
                guard status == .authorized else {
                    self.fail("speech-denied", code: 2)
                    return
                }
                self.requestMicrophoneAccess()
            }
        }

        dispatchMain()
    }

    private func requestMicrophoneAccess() {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            startRecognition()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self, !self.finished else { return }
                    if granted {
                        self.startRecognition()
                    } else {
                        self.fail("mic-denied", code: 3)
                    }
                }
            }
        case .denied, .restricted:
            fail("mic-denied", code: 3)
        @unknown default:
            fail("mic-denied", code: 3)
        }
    }

    private func startRecognition() {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.supportsOnDeviceRecognition else {
            fail("no-on-device", code: 4)
            return
        }

        recognitionRequest.requiresOnDeviceRecognition = true
        recognitionRequest.shouldReportPartialResults = true

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, _ in
            guard let result else { return }
            let transcript = result.bestTranscription.formattedString.lowercased()
            DispatchQueue.main.async {
                guard let self, !self.finished else { return }
                writeLine(transcript, to: .standardOutput)
            }
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: recordingFormat) { [weak self] buffer, _ in
            guard let self else { return }
            self.emitReadyOnce()
            self.recognitionRequest.append(buffer)
        }
        inputTapInstalled = true

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            finish(code: 0)
        }
    }

    private func emitReadyOnce() {
        readyLock.lock()
        defer { readyLock.unlock() }
        guard !printedReady else { return }
        printedReady = true
        writeLine("READY", to: .standardOutput)
    }

    private func watchStandardInput() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while !FileHandle.standardInput.readData(ofLength: 1).isEmpty {}
            DispatchQueue.main.async {
                self?.finish(code: 0)
            }
        }
    }

    private func installTerminationHandler() {
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { [weak self] in
            self?.finish(code: 0)
        }
        source.resume()
        signalSource = source
    }

    private func fail(_ reason: String, code: Int32) {
        writeLine("ERROR \(reason)", to: .standardError)
        finish(code: code)
    }

    private func finish(code: Int32) -> Never {
        guard !finished else { exit(code) }
        finished = true
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if inputTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            inputTapInstalled = false
        }
        recognitionRequest.endAudio()
        recognitionTask?.cancel()
        signalSource?.cancel()
        exit(code)
    }
}

let arguments = Array(CommandLine.arguments[1...])
private let listener = Listener()
listener.run(timeoutMilliseconds: timeoutMilliseconds(from: arguments))
