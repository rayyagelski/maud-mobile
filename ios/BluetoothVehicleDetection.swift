import AVFAudio
import Foundation
import UIKit

/// Detects the phone's audio route switching to the car's Bluetooth
/// hands-free/audio connection (HFP/A2DP) — used to auto-select the paired
/// vehicle for a trip. Does not itself identify the driver (see
/// useBluetoothVehicleDetection.ts). No Bluetooth permission/usage
/// description is needed on iOS for this — it's audio-route info via
/// AVAudioSession, not CoreBluetooth.
@objc(BluetoothVehicleDetection)
class BluetoothVehicleDetection: RCTEventEmitter {
  private var observing = false
  private var connectedDeviceName: String?
  private var screenStateObserving = false
  private var speechAudioActive = false
  private var speechAudioGeneration = 0
  private var disconnectCheckPending = false
  private var disconnectCheckGeneration = 0
  private let disconnectConfirmSeconds = 8.0
  // connectedDeviceName and the speech-audio state are only touched here;
  // AVAudioSession calls can block, so they stay off the main thread too.
  private let audioQueue = DispatchQueue(label: "com.maudconnect.speechaudio")

  override func supportedEvents() -> [String]! {
    // onNetworkStatusChanged is Android-only and never emitted here, but must
    // be declared: RCTEventEmitter throws if JS subscribes to an undeclared event.
    return [
      "onBluetoothDeviceConnected",
      "onBluetoothDeviceDisconnected",
      "onScreenInteractiveChanged",
      "onNetworkStatusChanged",
    ]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func startObserving() {
    observing = true
  }

  override func stopObserving() {
    observing = false
  }

  @objc(start:rejecter:)
  func start(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    audioQueue.async {
      self.connectedDeviceName = self.bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)
      resolve(true)
    }
  }

  @objc func stop() {
    NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
  }

  @objc(getConnectedDeviceName:rejecter:)
  func getConnectedDeviceName(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    audioQueue.async {
      resolve(self.connectedDeviceName)
    }
  }

  // iOS has no equivalent to Android's BluetoothAdapter.getBondedDevices() —
  // AVAudioSession only exposes the currently-active route, not the
  // system's list of previously-paired devices, and CoreBluetooth doesn't
  // cover Classic HFP/A2DP at all. Always empty here; kept for interface
  // parity with the Android module so the JS bridge call doesn't need
  // Platform.OS branching.
  @objc(getBondedDevices:rejecter:)
  func getBondedDevices(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve([String]())
  }

  // Locked vs unlocked, for the phone-usage proxy: iOS reports a locked
  // screen as 'background' just like switching to another app, so a drive
  // with the phone locked in the holder counted as minutes of "other app"
  // usage. iOS has no public screen-on/lock event, but on a phone with a
  // passcode (required for Face ID / Touch ID) the protected-data
  // notifications are one: data becomes unavailable when it locks — up to
  // ~10 s after the lock itself, see useHarshEventTracker.ts for how that
  // lag is handled — and available again on unlock. Without a passcode
  // they never fire and the state stays "interactive" (AppState-only, as
  // before).
  @objc(startScreenStateUpdates)
  func startScreenStateUpdates() {
    DispatchQueue.main.async {
      if self.screenStateObserving { return }
      self.screenStateObserving = true
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleProtectedDataUnavailable(_:)),
        name: UIApplication.protectedDataWillBecomeUnavailableNotification,
        object: nil
      )
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleProtectedDataAvailable(_:)),
        name: UIApplication.protectedDataDidBecomeAvailableNotification,
        object: nil
      )
    }
  }

  @objc(isScreenInteractive:rejecter:)
  func isScreenInteractive(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolve(UIApplication.shared.isProtectedDataAvailable)
    }
  }

  @objc private func handleProtectedDataUnavailable(_ notification: Notification) {
    if observing {
      sendEvent(withName: "onScreenInteractiveChanged", body: ["interactive": false])
    }
  }

  @objc private func handleProtectedDataAvailable(_ notification: Notification) {
    if observing {
      sendEvent(withName: "onScreenInteractiveChanged", body: ["interactive": true])
    }
  }

  // Spoken announcements always play on the phone's own speaker, never the
  // car — product decision, same as Android (useVoicePlayback.ts). Forcing
  // the speaker is only possible in the play-and-record category (the
  // microphone is never used), and it can't stay set between messages:
  //  - It moves the whole phone's audio, so the driver's music would stay on
  //    the phone instead of the car.
  //  - The car is detected from the audio route, so handleRouteChange must
  //    not mistake the speaker for the car disconnecting, which ends the
  //    trip. While speechAudioActive it ignores route changes, and the route
  //    is re-read once the session has settled back.
  // Plain playback isn't an option: it goes to the car, unheard unless the
  // car's source is Bluetooth audio. Voice-prompt mode made the car show
  // "Call in Progress" (real drive, Nov 2026).
  @objc(beginSpeechAudio:rejecter:)
  func beginSpeechAudio(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    audioQueue.async {
      self.speechAudioGeneration += 1
      self.speechAudioActive = true
      let session = AVAudioSession.sharedInstance()
      do {
        try session.setCategory(
          .playAndRecord,
          mode: .default,
          options: [.defaultToSpeaker, .interruptSpokenAudioAndMixWithOthers]
        )
        try session.setActive(true)
        try session.overrideOutputAudioPort(.speaker)
        resolve(session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker })
      } catch {
        // Still speak, wherever iOS sends it, rather than stay silent.
        self.setIdleAudioCategory()
        resolve(false)
      }
    }
  }

  @objc(endSpeechAudio)
  func endSpeechAudio() {
    audioQueue.async {
      let generation = self.speechAudioGeneration
      // The synthesizer reports the end slightly before its audio stops, and
      // deactivating a session that's still playing fails.
      self.audioQueue.asyncAfter(deadline: .now() + 0.3) {
        guard generation == self.speechAudioGeneration else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.overrideOutputAudioPort(.none)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        self.setIdleAudioCategory()
        // The route takes a moment to return to the car.
        self.audioQueue.asyncAfter(deadline: .now() + 1.5) {
          guard generation == self.speechAudioGeneration else { return }
          self.speechAudioActive = false
          self.evaluateRoute()
        }
      }
    }
  }

  // Between messages currentRoute has to report the car again, which it
  // doesn't while the category is play-and-record without Bluetooth options.
  private func setIdleAudioCategory() {
    try? AVAudioSession.sharedInstance().setCategory(
      .playback,
      mode: .default,
      options: [.interruptSpokenAudioAndMixWithOthers]
    )
  }

  // Android-only concept (Data Saver / restricted background) — iOS has no
  // equivalent per-app switch exposed to the app. Interface parity only.
  // Android-only diagnostic; no equivalent per-app block status on iOS.
  @objc(startNetworkStatusUpdates)
  func startNetworkStatusUpdates() {}

  @objc(getBackgroundRestrictions:rejecter:)
  func getBackgroundRestrictions(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(["dataSaver": "unknown", "backgroundRestricted": NSNull()])
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    audioQueue.async {
      self.evaluateRoute()
    }
  }

  private func evaluateRoute() {
    if speechAudioActive { return }
    let newName = bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)

    if newName != nil {
      cancelDisconnectCheck()
    }
    if newName != nil && newName != connectedDeviceName {
      connectedDeviceName = newName
      if observing {
        sendEvent(withName: "onBluetoothDeviceConnected", body: ["deviceName": newName!])
      }
    } else if newName == nil && connectedDeviceName != nil && !disconnectCheckPending {
      // JS ends the trip on this event, so the car has to stay gone first:
      // the route also leaves it briefly when nothing is wrong, such as after
      // an announcement or when another app takes the audio.
      disconnectCheckPending = true
      disconnectCheckGeneration += 1
      let generation = disconnectCheckGeneration
      audioQueue.asyncAfter(deadline: .now() + disconnectConfirmSeconds) {
        guard generation == self.disconnectCheckGeneration else { return }
        self.disconnectCheckPending = false
        self.confirmDisconnect()
      }
    }
  }

  private func cancelDisconnectCheck() {
    disconnectCheckPending = false
    disconnectCheckGeneration += 1
  }

  private func confirmDisconnect() {
    // Speaking: endSpeechAudio re-reads the route and starts a new check.
    if speechAudioActive { return }
    let route = AVAudioSession.sharedInstance().currentRoute
    guard bluetoothDeviceName(in: route) == nil, let previousName = connectedDeviceName else { return }
    connectedDeviceName = nil
    if observing {
      sendEvent(withName: "onBluetoothDeviceDisconnected", body: [
        "deviceName": previousName,
        "route": route.outputs.map { $0.portType.rawValue }.joined(separator: ","),
      ])
    }
  }

  private func bluetoothDeviceName(in route: AVAudioSessionRouteDescription) -> String? {
    let bluetoothPortTypes: Set<AVAudioSession.Port> = [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE]
    return route.outputs.first { bluetoothPortTypes.contains($0.portType) }?.portName
  }
}
