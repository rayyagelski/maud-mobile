import AVFAudio
import Foundation

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

  override func supportedEvents() -> [String]! {
    return ["onBluetoothDeviceConnected", "onBluetoothDeviceDisconnected"]
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

  // iOS exposes no public screen-on/unlocked state to apps; the phone-usage
  // proxy on iOS therefore stays AppState-only (iOS also doesn't report a
  // locked screen as 'background' the way Android does, so the Android
  // problem this exists for doesn't arise there). Interface parity only.
  @objc(startScreenStateUpdates)
  func startScreenStateUpdates() {}

  @objc(isScreenInteractive:rejecter:)
  func isScreenInteractive(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(true)
  }

  // Android-only concept (Data Saver / restricted background) — iOS has no
  // equivalent per-app switch exposed to the app. Interface parity only.
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
