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
    connectedDeviceName = bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)
    resolve(true)
  }

  @objc func stop() {
    NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
  }

  @objc(getConnectedDeviceName:rejecter:)
  func getConnectedDeviceName(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(connectedDeviceName)
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
    let newName = bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)

    if newName != nil && newName != connectedDeviceName {
      connectedDeviceName = newName
      if observing {
        sendEvent(withName: "onBluetoothDeviceConnected", body: ["deviceName": newName!])
      }
    } else if newName == nil && connectedDeviceName != nil {
      let previousName = connectedDeviceName
      connectedDeviceName = nil
      if observing {
        sendEvent(withName: "onBluetoothDeviceDisconnected", body: ["deviceName": previousName as Any])
      }
    }
  }

  private func bluetoothDeviceName(in route: AVAudioSessionRouteDescription) -> String? {
    let bluetoothPortTypes: Set<AVAudioSession.Port> = [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE]
    return route.outputs.first { bluetoothPortTypes.contains($0.portType) }?.portName
  }
}
